import { SPX } from "../data/benchmarks";
import { getFundamentals, knownSymbols } from "../data/fundamentals";
import type { AnalystRating, Fundamentals, Portfolio, Sector } from "../types";

/**
 * Discover — stock-idea engine.
 *
 * Screens the bundled fundamentals universe for names you do NOT already hold
 * and ranks them as *additions to this specific portfolio*. Each candidate gets
 * six 0–100 sub-scores: five standalone (quality, growth, value, momentum,
 * analyst posture) and one portfolio-aware **fit** score that rewards filling
 * the sectors your book is light in and relieving concentration. The composite
 * is a fixed-weight blend, nudged by insider posture, and every suggestion
 * carries plain-language reasons drawn from the same numbers.
 *
 * All pure and deterministic — same portfolio in, same ranking out. Live prices
 * never enter the score; the page may overlay an implied-upside figure for
 * display only.
 */

export interface SubScores {
  quality: number;
  growth: number;
  value: number;
  momentum: number;
  analyst: number;
  fit: number;
}

export type SubScoreId = keyof SubScores;

export interface SuggestionReason {
  kind: SubScoreId | "income" | "insider";
  text: string;
}

export interface Suggestion {
  symbol: string;
  name: string;
  sector: Sector;
  fundamentals: Fundamentals;
  /** 0–100 composite conviction as a *fit-weighted* addition. */
  score: number;
  subScores: SubScores;
  /** Dominant sub-score — drives the headline tag. */
  lead: SubScoreId;
  reasons: SuggestionReason[];
  rating: AnalystRating;
  /** Mean 12m analyst target (snapshot). */
  priceTarget: number;
}

export interface SectorGap {
  sector: Sector;
  held: number; // invested weight in your book
  target: number; // S&P 500 weight
  gap: number; // target − held; positive = you're underweight
}

export interface SuggestionContext {
  /** Invested (ex-cash) sector weights of the current book. */
  sectorWeights: Partial<Record<Sector, number>>;
  /** Herfindahl concentration of invested weights (0–1; higher = tighter). */
  concentration: number;
  /** Sectors the book is most underweight vs the S&P 500, biggest gap first. */
  gaps: SectorGap[];
  heldSymbols: string[];
}

export interface SuggestionReport {
  context: SuggestionContext;
  suggestions: Suggestion[];
}

const SUB_SCORE_WEIGHTS: SubScores = {
  quality: 0.22,
  growth: 0.18,
  value: 0.15,
  momentum: 0.1,
  analyst: 0.15,
  fit: 0.2,
};

export const SUB_SCORE_LABEL: Record<SubScoreId, string> = {
  quality: "Quality",
  growth: "Growth",
  value: "Value",
  momentum: "Momentum",
  analyst: "Analyst",
  fit: "Fit",
};

/** Short headline shown as the card's lead tag, keyed by dominant sub-score. */
export const LEAD_TAG: Record<SubScoreId, string> = {
  quality: "Quality compounder",
  growth: "High growth",
  value: "Attractively priced",
  momentum: "Strong momentum",
  analyst: "Street favorite",
  fit: "Fills a gap",
};

const RATING_SCORE: Record<AnalystRating, number> = {
  "Strong Buy": 90,
  Buy: 72,
  Hold: 50,
  Sell: 28,
  "Strong Sell": 12,
};

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

/** Logistic score vs a benchmark: 50 = in line, saturating toward 0/100. */
function relScore(value: number, benchmark: number, lowerIsBetter = false): number {
  if (!Number.isFinite(value) || benchmark === 0) return 50;
  const ratio = value / benchmark;
  const x = lowerIsBetter ? 2 - ratio : ratio;
  return clamp(100 / (1 + Math.exp(-(x - 1) * 2.6)));
}

/** Weighted average of (score, weight) pairs. */
const blend = (parts: [number, number][]): number => {
  const w = parts.reduce((s, [, wt]) => s + wt, 0);
  return w > 0 ? parts.reduce((s, [v, wt]) => s + v * wt, 0) / w : 50;
};

function qualityScore(f: Fundamentals): number {
  return blend([
    [relScore(f.roic, SPX.roic), 0.4],
    [relScore(f.operatingMargin, SPX.operatingMargin), 0.3],
    [relScore(f.grossMargin, SPX.grossMargin), 0.3],
  ]);
}

function growthScore(f: Fundamentals): number {
  return blend([
    [relScore(f.revenueGrowth, SPX.revenueGrowth), 0.35],
    [relScore(f.epsGrowth, SPX.epsGrowth), 0.4],
    [relScore(f.fcfGrowth, SPX.fcfGrowth), 0.25],
  ]);
}

function valueScore(f: Fundamentals): number {
  const profitable = f.forwardPE != null && f.forwardPE > 0;
  // Unprofitable names anchor low on multiples but still earn back via FCF yield.
  const peScore = profitable ? relScore(f.forwardPE!, SPX.forwardPE, true) : 22;
  const peg =
    profitable && f.epsGrowth > 0 ? f.forwardPE! / (f.epsGrowth * 100) : null;
  const pegBench = SPX.forwardPE / (SPX.epsGrowth * 100);
  const pegScore = peg != null ? relScore(peg, pegBench, true) : 40;
  const fcfScore = relScore(f.fcfYield, SPX.fcfYield);
  return blend([
    [peScore, 0.45],
    [pegScore, 0.25],
    [fcfScore, 0.3],
  ]);
}

function momentumScore(f: Fundamentals): number {
  // Reward a healthy uptrend without chasing parabolas: scores taper past ~3×
  // the market's trailing return.
  const r = f.return12m;
  if (r <= SPX.return12m) return relScore(r, Math.abs(SPX.return12m) || 0.1);
  const excess = Math.min(r - SPX.return12m, 0.9);
  return clamp(55 + excess * 55);
}

function analystScore(f: Fundamentals): number {
  const base = RATING_SCORE[f.analyst.rating] ?? 50;
  // Deeper coverage firms up a bullish/bearish read a touch.
  const conviction = Math.min((f.analyst.count ?? 0) / 35, 1);
  return clamp(50 + (base - 50) * (0.7 + 0.3 * conviction));
}

/**
 * Portfolio-aware fit. Broad funds score on how concentrated your book is;
 * single names score on how underweight their sector is vs the S&P 500, with a
 * bonus for sectors you barely touch.
 */
function fitScore(sector: Sector, ctx: SuggestionContext): number {
  if (sector === "Diversified") {
    // A total-market fund is most valuable to a tightly concentrated book.
    return clamp(45 + (ctx.concentration - 0.06) * 260, 20, 100);
  }
  const held = ctx.sectorWeights[sector] ?? 0;
  const target = SPX.sectorWeights[sector] ?? 0.02;
  let s = 50 + (target - held) * 170;
  if (held < 0.02) s += 14; // effectively new exposure
  if (held > target * 1.6) s -= 6; // already crowded here
  return clamp(s, 4, 100);
}

function compositeOf(sub: SubScores, f: Fundamentals): number {
  let s = (Object.keys(SUB_SCORE_WEIGHTS) as SubScoreId[]).reduce(
    (acc, k) => acc + sub[k] * SUB_SCORE_WEIGHTS[k],
    0
  );
  if (f.insider.signal === "Buying") s += 2.5;
  else if (f.insider.signal === "Selling" && f.insider.netActivity6m < -50) s -= 3;
  return clamp(s);
}

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

/** Build ranked reasons; the strongest sub-scores surface first. */
function buildReasons(
  f: Fundamentals,
  sub: SubScores,
  ctx: SuggestionContext
): SuggestionReason[] {
  const pool: { reason: SuggestionReason; strength: number }[] = [];

  if (f.sector === "Diversified") {
    pool.push({
      reason: {
        kind: "fit",
        text:
          ctx.concentration > 0.12
            ? `One-line diversification — your book is concentrated in ${ctx.heldSymbols.length} names`
            : `Broad-market ballast across hundreds of holdings`,
      },
      strength: sub.fit,
    });
  } else {
    const held = ctx.sectorWeights[f.sector] ?? 0;
    const target = SPX.sectorWeights[f.sector] ?? 0;
    if (held < 0.02) {
      pool.push({
        reason: { kind: "fit", text: `Adds your first ${f.sector} exposure` },
        strength: sub.fit + 6,
      });
    } else if (target - held > 0.02) {
      pool.push({
        reason: {
          kind: "fit",
          text: `Diversifies into ${f.sector} — you hold ${pct(held)} vs the market's ${pct(target)}`,
        },
        strength: sub.fit,
      });
    }
  }

  if (sub.quality >= 60)
    pool.push({
      reason: {
        kind: "quality",
        text: `Top-tier capital efficiency — ${pct(f.roic)} ROIC on ${pct(f.operatingMargin)} operating margins`,
      },
      strength: sub.quality,
    });

  if (sub.growth >= 60)
    pool.push({
      reason: {
        kind: "growth",
        text: `Compounding fast — ${pct(f.revenueGrowth)} revenue and ${pct(f.epsGrowth)} EPS growth`,
      },
      strength: sub.growth,
    });

  if (sub.value >= 60 && f.forwardPE && f.forwardPE > 0)
    pool.push({
      reason: {
        kind: "value",
        text: `Reasonably priced at ${f.forwardPE.toFixed(1)}× forward earnings vs the S&P's ${SPX.forwardPE.toFixed(0)}×`,
      },
      strength: sub.value,
    });

  if (f.analyst.rating === "Strong Buy" || f.analyst.rating === "Buy")
    pool.push({
      reason: {
        kind: "analyst",
        text: `${f.analyst.rating} across ${f.analyst.count} analysts, ${fmtTarget(f)} mean target`,
      },
      strength: sub.analyst,
    });

  if (sub.momentum >= 64 && f.return12m > 0.15)
    pool.push({
      reason: { kind: "momentum", text: `Up ${pct(f.return12m)} over the past year` },
      strength: sub.momentum,
    });

  if (f.dividendYield >= 0.025)
    pool.push({
      reason: { kind: "income", text: `Pays a ${pct(f.dividendYield, 1)} dividend yield` },
      strength: 45 + f.dividendYield * 200,
    });

  if (f.insider.signal === "Buying")
    pool.push({
      reason: { kind: "insider", text: `Insiders are net buyers` },
      strength: 52,
    });

  // Baseline so every card says something, even a middling name in a crowded
  // sector. Strength 1 keeps it last — it only shows when nothing stronger does.
  pool.push({
    reason: {
      kind: "fit",
      text:
        f.sector === "Diversified"
          ? `Broadens your portfolio with diversified exposure`
          : `Rounds out your ${f.sector} exposure`,
    },
    strength: 1,
  });

  pool.sort((a, b) => b.strength - a.strength);
  return pool.slice(0, 3).map((p) => p.reason);
}

function fmtTarget(f: Fundamentals): string {
  const t = f.analyst.priceTarget;
  return t >= 1000 ? `$${(t / 1000).toFixed(1)}k` : `$${Math.round(t)}`;
}

function leadOf(sub: SubScores): SubScoreId {
  return (Object.keys(sub) as SubScoreId[]).reduce((a, b) =>
    sub[b] > sub[a] ? b : a
  );
}

/** Invested (ex-cash) sector weights + Herfindahl concentration of the book. */
function analyzePortfolio(portfolio: Portfolio): {
  sectorWeights: Partial<Record<Sector, number>>;
  concentration: number;
} {
  const sectorWeights: Partial<Record<Sector, number>> = {};
  let hhi = 0;
  for (const p of portfolio.positions) {
    const w = p.equityWeight;
    hhi += w * w;
    const sec = p.fundamentals?.sector;
    if (sec) sectorWeights[sec] = (sectorWeights[sec] ?? 0) + w;
  }
  return { sectorWeights, concentration: hhi };
}

function gapsOf(sectorWeights: Partial<Record<Sector, number>>): SectorGap[] {
  return (Object.keys(SPX.sectorWeights) as Sector[])
    .map((sector) => {
      const target = SPX.sectorWeights[sector] ?? 0;
      const held = sectorWeights[sector] ?? 0;
      return { sector, held, target, gap: target - held };
    })
    .sort((a, b) => b.gap - a.gap);
}

export interface SuggestionOptions {
  /** Restrict to a single sector ("Diversified" = ETFs/funds). */
  sector?: Sector | "all";
  /** Cap the returned list. */
  limit?: number;
}

export function suggestionReport(
  portfolio: Portfolio,
  opts: SuggestionOptions = {}
): SuggestionReport {
  const { sectorWeights, concentration } = analyzePortfolio(portfolio);
  const heldSymbols = portfolio.positions.map((p) => p.symbol.toUpperCase());
  const held = new Set(heldSymbols);
  const context: SuggestionContext = {
    sectorWeights,
    concentration,
    gaps: gapsOf(sectorWeights),
    heldSymbols,
  };

  const wantSector = opts.sector && opts.sector !== "all" ? opts.sector : null;

  const suggestions: Suggestion[] = [];
  for (const sym of knownSymbols()) {
    if (held.has(sym.toUpperCase())) continue;
    const f = getFundamentals(sym);
    if (!f) continue;
    if (wantSector && f.sector !== wantSector) continue;

    const sub: SubScores = {
      quality: qualityScore(f),
      growth: growthScore(f),
      value: valueScore(f),
      momentum: momentumScore(f),
      analyst: analystScore(f),
      fit: fitScore(f.sector, context),
    };
    const score = compositeOf(sub, f);
    suggestions.push({
      symbol: f.symbol,
      name: f.name,
      sector: f.sector,
      fundamentals: f,
      score,
      subScores: sub,
      lead: leadOf(sub),
      reasons: buildReasons(f, sub, context),
      rating: f.analyst.rating,
      priceTarget: f.analyst.priceTarget,
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return {
    context,
    suggestions: opts.limit ? suggestions.slice(0, opts.limit) : suggestions,
  };
}

/** Sectors present among candidates not already held, for the filter dropdown. */
export function availableSectors(portfolio: Portfolio): Sector[] {
  const held = new Set(portfolio.positions.map((p) => p.symbol.toUpperCase()));
  const seen = new Set<Sector>();
  for (const sym of knownSymbols()) {
    if (held.has(sym.toUpperCase())) continue;
    const f = getFundamentals(sym);
    if (f) seen.add(f.sector);
  }
  return [...seen];
}
