import { CMA, SPX } from "../data/benchmarks";
import { getFundamentals, knownSymbols, UNKNOWN_DEFAULTS } from "../data/fundamentals";
import type { AnalystRating, Fundamentals, Portfolio, Sector } from "../types";
import { corrInputs, factorCovariance, type CorrInputs } from "./correlation";

/**
 * Discover — stock-idea engine.
 *
 * Screens the bundled fundamentals universe for names you do NOT already hold
 * and ranks them as *additions to this specific portfolio*. Each candidate gets
 * six 0–100 sub-scores: five standalone (quality, growth, value, momentum,
 * analyst posture) and one portfolio-aware **fit** score.
 *
 * Fit is genuinely portfolio-level: it blends the sector gap vs the S&P 500 with
 * the *marginal risk/return impact* of actually adding the name — how a 5%
 * position would move the book's Sharpe ratio, effective-holding count and
 * diversification. Those marginals reuse the same PSD factor covariance and
 * CAPM expected returns the Risk page is built on, so the numbers reconcile.
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
  kind: SubScoreId | "income" | "insider" | "risk";
  text: string;
}

/** Book-level risk/return snapshot (mirrors the Risk page definitions). */
export interface PortfolioMetrics {
  expectedReturn: number; // CAPM, decimal
  volatility: number; // annualized, decimal
  sharpe: number;
  beta: number; // incl. cash drag
  effectiveHoldings: number; // 1 / HHI on the invested book
  diversificationRatio: number; // Σwσ / σ_p, invested
}

/** What adding a fixed-size position in a candidate would do to the book. */
export interface MarginalImpact {
  addWeight: number; // the notional add, as a fraction of the post-trade book
  before: PortfolioMetrics;
  after: PortfolioMetrics;
  dExpectedReturn: number;
  dVolatility: number;
  dSharpe: number;
  dBeta: number;
  dEffectiveHoldings: number;
  dDiversificationRatio: number;
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
  /** Marginal risk/return impact of a model-sized add. */
  impact: MarginalImpact;
}

export interface SectorGap {
  sector: Sector;
  held: number;
  target: number;
  gap: number; // target − held; positive = you're underweight
}

export interface SuggestionContext {
  sectorWeights: Partial<Record<Sector, number>>;
  concentration: number; // Herfindahl of invested weights
  gaps: SectorGap[];
  heldSymbols: string[];
  /** Current book metrics, the baseline every marginal impact is measured against. */
  metrics: PortfolioMetrics;
}

export interface SuggestionReport {
  context: SuggestionContext;
  suggestions: Suggestion[];
}

/** The notional position size used for the marginal-impact analysis. */
export const MODEL_ADD_WEIGHT = 0.05;

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

export const LEAD_TAG: Record<SubScoreId, string> = {
  quality: "Quality compounder",
  growth: "High growth",
  value: "Attractively priced",
  momentum: "Strong momentum",
  analyst: "Street favorite",
  fit: "Strong portfolio fit",
};

const RATING_SCORE: Record<AnalystRating, number> = {
  "Strong Buy": 90,
  Buy: 72,
  Hold: 50,
  Sell: 28,
  "Strong Sell": 12,
};

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

function relScore(value: number, benchmark: number, lowerIsBetter = false): number {
  if (!Number.isFinite(value) || benchmark === 0) return 50;
  const ratio = value / benchmark;
  const x = lowerIsBetter ? 2 - ratio : ratio;
  return clamp(100 / (1 + Math.exp(-(x - 1) * 2.6)));
}

const blend = (parts: [number, number][]): number => {
  const w = parts.reduce((s, [, wt]) => s + wt, 0);
  return w > 0 ? parts.reduce((s, [v, wt]) => s + v * wt, 0) / w : 50;
};

/* --------------------------- standalone sub-scores --------------------------- */

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
  const peScore = profitable ? relScore(f.forwardPE!, SPX.forwardPE, true) : 22;
  const peg = profitable && f.epsGrowth > 0 ? f.forwardPE! / (f.epsGrowth * 100) : null;
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
  const r = f.return12m;
  if (r <= SPX.return12m) return relScore(r, Math.abs(SPX.return12m) || 0.1);
  const excess = Math.min(r - SPX.return12m, 0.9);
  return clamp(55 + excess * 55);
}

function analystScore(f: Fundamentals): number {
  const base = RATING_SCORE[f.analyst.rating] ?? 50;
  const conviction = Math.min((f.analyst.count ?? 0) / 35, 1);
  return clamp(50 + (base - 50) * (0.7 + 0.3 * conviction));
}

/* ----------------------------- portfolio metrics ----------------------------- */

/** Quadratic form wᵀΣw. */
function quad(w: number[], cov: number[][]): number {
  let v = 0;
  for (let i = 0; i < w.length; i++) {
    const row = cov[i];
    for (let j = 0; j < w.length; j++) v += w[i] * w[j] * row[j];
  }
  return v;
}

function candInputs(f: Fundamentals): CorrInputs {
  return {
    symbol: f.symbol,
    beta: f.beta,
    vol: f.volatility,
    sector: f.sector,
    industry: f.industry,
    isFund: !!f.fund,
  };
}

/**
 * Book metrics from CAPM + the PSD factor covariance.
 * `wTot` are total weights (positions; cash held separately as `cashW`);
 * `wEq` are invested (ex-cash) weights that sum to 1 over the positions.
 */
function portfolioMetrics(
  inputs: CorrInputs[],
  cov: number[][],
  wTot: number[],
  wEq: number[],
  cashW: number
): PortfolioMetrics {
  const rf = CMA.riskFree;
  const erp = CMA.equityRiskPremium;

  let beta = 0;
  let expectedReturn = cashW * rf;
  for (let i = 0; i < inputs.length; i++) {
    beta += wTot[i] * inputs[i].beta;
    expectedReturn += wTot[i] * (rf + inputs[i].beta * erp);
  }

  const volatility = Math.sqrt(Math.max(quad(wTot, cov), 0));
  const sharpe = volatility > 0 ? (expectedReturn - rf) / volatility : 0;

  const hhi = wEq.reduce((s, w) => s + w * w, 0);
  const effectiveHoldings = hhi > 0 ? 1 / hhi : 0;

  const wAvgVol = wEq.reduce((s, w, i) => s + w * inputs[i].vol, 0);
  const investedVol = Math.sqrt(Math.max(quad(wEq, cov), 0));
  const diversificationRatio = investedVol > 0 ? wAvgVol / investedVol : 1;

  return {
    expectedReturn,
    volatility,
    sharpe,
    beta,
    effectiveHoldings,
    diversificationRatio,
  };
}

interface BaseState {
  inputs: CorrInputs[];
  wTot: number[];
  wEq: number[];
  cashW: number;
  metrics: PortfolioMetrics;
}

function baseState(portfolio: Portfolio): BaseState {
  const ps = portfolio.positions;
  const inputs = ps.map(corrInputs);
  const cov = factorCovariance(inputs);
  const wTot = ps.map((p) => p.weight);
  const wEq = ps.map((p) => p.equityWeight);
  const cashW = portfolio.cashWeight;
  return {
    inputs,
    wTot,
    wEq,
    cashW,
    metrics: portfolioMetrics(inputs, cov, wTot, wEq, cashW),
  };
}

/** Marginal impact of adding `f` at weight `t` of the post-trade book. */
function marginalImpact(base: BaseState, f: Fundamentals, t = MODEL_ADD_WEIGHT): MarginalImpact {
  const inputs2 = [...base.inputs, candInputs(f)];
  const cov2 = factorCovariance(inputs2);

  const wTot2 = [...base.wTot.map((w) => w * (1 - t)), t];
  const cashW2 = base.cashW * (1 - t);

  // Renormalize invested weights over the existing names + the new position.
  const investedMass = (1 - t) * (1 - base.cashW) + t;
  const wEq2 = [
    ...base.wEq.map((w) => (w * (1 - t) * (1 - base.cashW)) / investedMass),
    t / investedMass,
  ];

  const after = portfolioMetrics(inputs2, cov2, wTot2, wEq2, cashW2);
  const before = base.metrics;
  return {
    addWeight: t,
    before,
    after,
    dExpectedReturn: after.expectedReturn - before.expectedReturn,
    dVolatility: after.volatility - before.volatility,
    dSharpe: after.sharpe - before.sharpe,
    dBeta: after.beta - before.beta,
    dEffectiveHoldings: after.effectiveHoldings - before.effectiveHoldings,
    dDiversificationRatio: after.diversificationRatio - before.diversificationRatio,
  };
}

/* -------------------------------- fit score -------------------------------- */

/** Sector/concentration component of fit. */
function sectorFit(sector: Sector, ctx: SuggestionContext): number {
  if (sector === "Diversified") {
    return clamp(45 + (ctx.concentration - 0.06) * 260, 20, 100);
  }
  const held = ctx.sectorWeights[sector] ?? 0;
  const target = SPX.sectorWeights[sector] ?? 0.02;
  let s = 50 + (target - held) * 170;
  if (held < 0.02) s += 14;
  if (held > target * 1.6) s -= 6;
  return clamp(s, 4, 100);
}

/**
 * Portfolio fit = sector gap blended with the marginal risk/return impact of
 * actually adding the name. Names that lift Sharpe and diversify the book are
 * rewarded; ones that concentrate it are penalized.
 */
function fitScore(sector: Sector, ctx: SuggestionContext, m: MarginalImpact): number {
  const sectorComp = sectorFit(sector, ctx);
  const sharpeComp = clamp(50 + m.dSharpe * 700);
  const diversComp = clamp(50 + m.dEffectiveHoldings * 45 + m.dDiversificationRatio * 120);
  return clamp(
    blend([
      [sectorComp, 0.45],
      [sharpeComp, 0.33],
      [diversComp, 0.22],
    ])
  );
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

/* --------------------------------- reasons --------------------------------- */

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

function buildReasons(
  f: Fundamentals,
  sub: SubScores,
  ctx: SuggestionContext,
  m: MarginalImpact
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

  // Risk/return marginals — the genuinely portfolio-level reasons.
  if (m.dSharpe > 0.008)
    pool.push({
      reason: {
        kind: "risk",
        text: `Lifts the book's Sharpe ${m.before.sharpe.toFixed(2)} → ${m.after.sharpe.toFixed(2)}`,
      },
      strength: 60 + m.dSharpe * 400,
    });
  if (m.dEffectiveHoldings > 0.25)
    pool.push({
      reason: {
        kind: "risk",
        text: `Spreads risk wider — effective holdings ${m.before.effectiveHoldings.toFixed(1)} → ${m.after.effectiveHoldings.toFixed(1)}`,
      },
      strength: 55 + m.dEffectiveHoldings * 20,
    });
  if (m.dVolatility < -0.0015)
    pool.push({
      reason: { kind: "risk", text: `Lowers portfolio volatility by ${pct(-m.dVolatility, 1)}` },
      strength: 54,
    });
  else if (m.dBeta < -0.015)
    pool.push({
      reason: {
        kind: "risk",
        text: `Pulls portfolio beta ${m.before.beta.toFixed(2)} → ${m.after.beta.toFixed(2)}`,
      },
      strength: 52,
    });

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
    pool.push({ reason: { kind: "insider", text: `Insiders are net buyers` }, strength: 52 });

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
  return pool.slice(0, 4).map((p) => p.reason);
}

function fmtTarget(f: Fundamentals): string {
  const t = f.analyst.priceTarget;
  return t >= 1000 ? `$${(t / 1000).toFixed(1)}k` : `$${Math.round(t)}`;
}

function leadOf(sub: SubScores): SubScoreId {
  return (Object.keys(sub) as SubScoreId[]).reduce((a, b) => (sub[b] > sub[a] ? b : a));
}

/* --------------------------------- context --------------------------------- */

function analyzePortfolio(portfolio: Portfolio): {
  sectorWeights: Partial<Record<Sector, number>>;
  concentration: number;
} {
  const sectorWeights: Partial<Record<Sector, number>> = {};
  let hhi = 0;
  for (const p of portfolio.positions) {
    const w = p.equityWeight;
    hhi += w * w;
    const sec = p.fundamentals?.sector ?? UNKNOWN_DEFAULTS.sector;
    sectorWeights[sec] = (sectorWeights[sec] ?? 0) + w;
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
  sector?: Sector | "all";
  limit?: number;
}

export function suggestionReport(
  portfolio: Portfolio,
  opts: SuggestionOptions = {}
): SuggestionReport {
  const base = baseState(portfolio);
  const { sectorWeights, concentration } = analyzePortfolio(portfolio);
  const heldSymbols = portfolio.positions.map((p) => p.symbol.toUpperCase());
  const held = new Set(heldSymbols);
  const context: SuggestionContext = {
    sectorWeights,
    concentration,
    gaps: gapsOf(sectorWeights),
    heldSymbols,
    metrics: base.metrics,
  };

  const wantSector = opts.sector && opts.sector !== "all" ? opts.sector : null;

  const suggestions: Suggestion[] = [];
  for (const sym of knownSymbols()) {
    if (held.has(sym.toUpperCase())) continue;
    const f = getFundamentals(sym);
    if (!f) continue;
    if (wantSector && f.sector !== wantSector) continue;

    const impact = marginalImpact(base, f);
    const sub: SubScores = {
      quality: qualityScore(f),
      growth: growthScore(f),
      value: valueScore(f),
      momentum: momentumScore(f),
      analyst: analystScore(f),
      fit: fitScore(f.sector, context, impact),
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
      reasons: buildReasons(f, sub, context, impact),
      rating: f.analyst.rating,
      priceTarget: f.analyst.priceTarget,
      impact,
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return {
    context,
    suggestions: opts.limit ? suggestions.slice(0, opts.limit) : suggestions,
  };
}

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
