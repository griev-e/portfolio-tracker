import { SPX } from "../data/benchmarks";
import { resolveBenchmark } from "../data/assumptions";
import { getAssumptions } from "../live/assumptions";
import { liveBenchmark } from "../live/cma";
import type { BenchmarkProfile, Fundamentals, Portfolio } from "../types";

export type Grade =
  | "A+"
  | "A"
  | "A-"
  | "B+"
  | "B"
  | "B-"
  | "C+"
  | "C"
  | "C-"
  | "D"
  | "F";

export type MetricFormat = "pct" | "multiple" | "ratio";

export type QualityCategoryId = "growth" | "profitability" | "valuation" | "income";

export interface QualityMetric {
  key: string;
  label: string;
  value: number;
  benchmark: number; // S&P 500 reference
  /** true when a lower value is better (valuation multiples). */
  lowerIsBetter: boolean;
  format: MetricFormat;
  category: QualityCategoryId;
  /** Share of the composite this metric carries (weights sum to 1). */
  weight: number;
  grade: Grade;
  /** 0–100 score used in the composite. */
  score: number;
  description: string;
}

export interface QualityCategory {
  id: QualityCategoryId;
  label: string;
  /** 0–100 weighted blend of the category's metric scores. */
  score: number;
  grade: Grade;
  /** Share of the composite this whole category carries. */
  weight: number;
  metrics: QualityMetric[];
}

/** A metric's signed pull on the composite away from the index line (50). */
export interface MetricContribution {
  key: string;
  label: string;
  category: QualityCategoryId;
  /** weight × (score − 50): positive lifts above index, negative drags below. */
  contribution: number;
  score: number;
  grade: Grade;
  value: number;
  benchmark: number;
  format: MetricFormat;
  lowerIsBetter: boolean;
}

export interface HoldingQuality {
  symbol: string;
  name: string;
  /** Invested (ex-cash) weight. */
  weight: number;
  score: number;
  grade: Grade;
  /** Per-category sub-scores (0–100) for the mini profile. */
  categories: Record<QualityCategoryId, number>;
}

export interface QualityReport {
  metrics: QualityMetric[];
  categories: QualityCategory[];
  composite: number; // 0–100
  compositeGrade: Grade;
  coveragePct: number;
  /** Per-metric contributions, sorted most-lifting → most-dragging. */
  contributions: MetricContribution[];
  /** Per-holding quality, sorted best → worst. */
  holdings: HoldingQuality[];
}

function gradeFromScore(score: number): Grade {
  if (score >= 93) return "A+";
  if (score >= 85) return "A";
  if (score >= 78) return "A-";
  if (score >= 71) return "B+";
  if (score >= 64) return "B";
  if (score >= 57) return "B-";
  if (score >= 50) return "C+";
  if (score >= 43) return "C";
  if (score >= 36) return "C-";
  if (score >= 25) return "D";
  return "F";
}

/**
 * Score vs benchmark: 50 = in line, saturating toward 0/100 at ±2× the scale.
 *
 * Scored on the signed distance `(value − benchmark) / |benchmark|` rather than
 * the raw ratio: for a positive benchmark this equals `ratio − 1` (identical to
 * the previous curve), but it stays correctly ordered when the benchmark is
 * negative or zero — e.g. under the Recession preset (index EPS growth −10%), a
 * holding at −5% must score *above* 50 and one at −20% *below*, which a
 * ratio-based score inverts. The scale floor keeps a near-zero benchmark from
 * exploding the distance while still letting genuine outperformance register.
 */
function relScore(value: number, benchmark: number, lowerIsBetter: boolean): number {
  const scale = Math.max(Math.abs(benchmark), 0.01);
  let x = (value - benchmark) / scale;
  if (lowerIsBetter) x = -x;
  return Math.round(100 / (1 + Math.exp(-x * 2.6)));
}

const CATEGORY_LABEL: Record<QualityCategoryId, string> = {
  growth: "Growth",
  profitability: "Profitability",
  valuation: "Valuation",
  income: "Income & Yield",
};

export const CATEGORY_ORDER: QualityCategoryId[] = [
  "growth",
  "profitability",
  "valuation",
  "income",
];

interface MetricMeta {
  key: string;
  label: string;
  benchmark: number;
  lowerIsBetter: boolean;
  format: MetricFormat;
  description: string;
  category: QualityCategoryId;
  /** Composite weight — durable quality & growth lead; valuation is a check. */
  weight: number;
  /**
   * Score 50 (neutral) when the raw value is missing/non-finite instead of
   * penalizing as 3× benchmark. Used for leverage, where no provider reading
   * means "unknown balance sheet", not "terrible balance sheet".
   */
  missingNeutral?: boolean;
}

/**
 * Build the scorecard yardsticks from a benchmark profile. The benchmark is the
 * resolved S&P 500 — its valuation fields (P/E, FCF/dividend yield) come live
 * from the SPY proxy, its profitability & growth fields from the user's market
 * assumptions (no live index-level source exists; see lib/data/assumptions.ts).
 */
/**
 * S&P 500 aggregate debt/equity yardstick (ex-financials). No keyless index
 * source publishes this; ~1.2× is the long-run non-financial aggregate. Banks
 * are excluded from the leverage metric entirely — a 10× D/E is their business
 * model, not distress — so this benchmark never meets a financial's ratio.
 */
const SPX_DEBT_TO_EQUITY = 1.2;

function buildMetricMeta(b: BenchmarkProfile): MetricMeta[] {
  return [
    { key: "revenueGrowth", label: "Revenue Growth", benchmark: b.revenueGrowth, lowerIsBetter: false, format: "pct", description: "Weighted forward revenue growth across holdings", category: "growth", weight: 0.13 },
    { key: "epsGrowth", label: "EPS Growth", benchmark: b.epsGrowth, lowerIsBetter: false, format: "pct", description: "Weighted forward earnings-per-share growth", category: "growth", weight: 0.13 },
    { key: "fcfGrowth", label: "FCF Growth", benchmark: b.fcfGrowth, lowerIsBetter: false, format: "pct", description: "Weighted free-cash-flow growth", category: "growth", weight: 0.09 },
    { key: "roic", label: "ROIC", benchmark: b.roic, lowerIsBetter: false, format: "pct", description: "Weighted return on invested capital", category: "profitability", weight: 0.16 },
    { key: "operatingMargin", label: "Operating Margin", benchmark: b.operatingMargin, lowerIsBetter: false, format: "pct", description: "Weighted operating profitability", category: "profitability", weight: 0.12 },
    { key: "grossMargin", label: "Gross Margin", benchmark: b.grossMargin, lowerIsBetter: false, format: "pct", description: "Weighted gross profitability — pricing power proxy", category: "profitability", weight: 0.07 },
    { key: "leverage", label: "Debt / Equity", benchmark: SPX_DEBT_TO_EQUITY, lowerIsBetter: true, format: "ratio", description: "Weighted debt-to-equity vs the non-financial index aggregate — balance-sheet resilience (financials excluded; unknown scores neutral)", category: "profitability", weight: 0.06, missingNeutral: true },
    { key: "forwardPE", label: "Forward P/E", benchmark: b.forwardPE, lowerIsBetter: true, format: "multiple", description: "Weighted harmonic-mean forward price/earnings", category: "valuation", weight: 0.09 },
    { key: "peg", label: "PEG Ratio", benchmark: b.forwardPE / (b.epsGrowth * 100), lowerIsBetter: true, format: "ratio", description: "Forward P/E relative to EPS growth — growth-adjusted valuation", category: "valuation", weight: 0.05 },
    { key: "fcfYield", label: "FCF Yield", benchmark: b.fcfYield, lowerIsBetter: false, format: "pct", description: "Weighted free-cash-flow yield", category: "income", weight: 0.07 },
    { key: "dividendYield", label: "Dividend Yield", benchmark: b.dividendYield, lowerIsBetter: false, format: "pct", description: "Weighted dividend yield", category: "income", weight: 0.03 },
  ];
}

/** Build one scored metric from a raw value (Infinity → scored as 3× benchmark). */
function scoreOne(meta: MetricMeta, raw: number): QualityMetric {
  // A valuation multiple against a non-positive benchmark (e.g. PEG when the
  // index EPS-growth assumption is negative) has no meaningful ordering —
  // score it neutral instead of letting a nonsense yardstick move the grade.
  // Same for a missing reading on a metric that opted into missingNeutral.
  const meaningless =
    (meta.lowerIsBetter && meta.benchmark <= 0) ||
    (!!meta.missingNeutral && !Number.isFinite(raw));
  const forScoring = Number.isFinite(raw) ? raw : Math.abs(meta.benchmark) * 3;
  const score = meaningless
    ? 50
    : relScore(forScoring, meta.benchmark, meta.lowerIsBetter);
  return {
    key: meta.key,
    label: meta.label,
    value: raw,
    benchmark: meta.benchmark,
    lowerIsBetter: meta.lowerIsBetter,
    format: meta.format,
    category: meta.category,
    weight: meta.weight,
    grade: gradeFromScore(score),
    score,
    description: meta.description,
  };
}

const compositeOf = (metrics: QualityMetric[]): number =>
  Math.round(metrics.reduce((s, m) => s + m.score * m.weight, 0));

function categoriesOf(metrics: QualityMetric[]): QualityCategory[] {
  return CATEGORY_ORDER.map((id) => {
    const ms = metrics.filter((m) => m.category === id);
    const wsum = ms.reduce((s, m) => s + m.weight, 0);
    const score =
      wsum > 0 ? Math.round(ms.reduce((s, m) => s + m.score * m.weight, 0) / wsum) : 50;
    return { id, label: CATEGORY_LABEL[id], score, grade: gradeFromScore(score), weight: wsum, metrics: ms };
  });
}

/** Raw metric values for a single holding (mirrors the aggregate derivations). */
function holdingRaw(f: Fundamentals): Record<string, number> {
  const fpe = f.forwardPE && f.forwardPE > 0 ? f.forwardPE : Infinity;
  const peg = Number.isFinite(fpe) && f.epsGrowth > 0 ? fpe / (f.epsGrowth * 100) : Infinity;
  return {
    revenueGrowth: f.revenueGrowth,
    epsGrowth: f.epsGrowth,
    fcfGrowth: f.fcfGrowth,
    roic: f.roic,
    operatingMargin: f.operatingMargin,
    grossMargin: f.grossMargin,
    // Leverage: NaN (→ neutral via missingNeutral) for financials, whose D/E
    // is structural, and for names the provider has no reading on.
    leverage: leverageOf(f) ?? NaN,
    forwardPE: fpe,
    peg,
    fcfYield: f.fcfYield,
    dividendYield: f.dividendYield,
  };
}

/** The D/E reading the leverage metric scores, or null when not meaningful. */
function leverageOf(f: Fundamentals): number | null {
  if (f.sector === "Financials") return null;
  return f.debtToEquity;
}

/**
 * Weighted portfolio quality scorecard. All metrics are weighted by invested
 * (ex-cash) weight across holdings with fundamentals; forward P/E uses a
 * weighted harmonic mean (the correct aggregation for multiples). Metrics roll
 * up into four categories and a single composite; each holding is also graded
 * on its own with the identical scoring.
 */
export function qualityReport(portfolio: Portfolio): QualityReport {
  const benchmark = resolveBenchmark(SPX, getAssumptions(), liveBenchmark("spx"));
  const META = buildMetricMeta(benchmark);
  const ps = portfolio.positions.filter((p) => p.fundamentals);
  const covered = ps.reduce((s, p) => s + p.equityWeight, 0);
  const norm = covered > 0 ? covered : 1;

  const wavg = (get: (f: Fundamentals) => number) =>
    ps.reduce((s, p) => s + p.equityWeight * get(p.fundamentals!), 0) / norm;

  // Weighted harmonic mean P/E via aggregated earnings yield. Unprofitable
  // holdings contribute zero earnings, which correctly inflates the multiple.
  const earningsYield = wavg((f) => (f.forwardPE && f.forwardPE > 0 ? 1 / f.forwardPE : 0));
  const forwardPE = earningsYield > 0 ? 1 / earningsYield : Infinity;
  const epsGrowth = wavg((f) => f.epsGrowth);
  const peg =
    epsGrowth > 0 && Number.isFinite(forwardPE) ? forwardPE / (epsGrowth * 100) : Infinity;

  // Leverage aggregates only over names with a meaningful reading (non-null,
  // non-financial), renormalized to their own weight — NaN when none qualify,
  // which the metric's missingNeutral maps to a 50.
  let levW = 0;
  let levSum = 0;
  for (const p of ps) {
    const de = leverageOf(p.fundamentals!);
    if (de === null) continue;
    levW += p.equityWeight;
    levSum += p.equityWeight * de;
  }
  const leverage = levW > 0 ? levSum / levW : NaN;

  const rawAgg: Record<string, number> = {
    revenueGrowth: wavg((f) => f.revenueGrowth),
    epsGrowth,
    fcfGrowth: wavg((f) => f.fcfGrowth),
    roic: wavg((f) => f.roic),
    operatingMargin: wavg((f) => f.operatingMargin),
    grossMargin: wavg((f) => f.grossMargin),
    leverage,
    forwardPE,
    peg,
    fcfYield: wavg((f) => f.fcfYield),
    dividendYield: wavg((f) => f.dividendYield),
  };

  const metrics = META.map((m) => scoreOne(m, rawAgg[m.key]));
  const composite = compositeOf(metrics);
  const categories = categoriesOf(metrics);

  const contributions: MetricContribution[] = metrics
    .map((m) => ({
      key: m.key,
      label: m.label,
      category: m.category,
      contribution: m.weight * (m.score - 50),
      score: m.score,
      grade: m.grade,
      value: m.value,
      benchmark: m.benchmark,
      format: m.format,
      lowerIsBetter: m.lowerIsBetter,
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const holdings: HoldingQuality[] = ps
    .map((p) => {
      const ms = META.map((m) => scoreOne(m, holdingRaw(p.fundamentals!)[m.key]));
      const cats = categoriesOf(ms);
      const score = compositeOf(ms);
      return {
        symbol: p.symbol,
        name: p.fundamentals!.name,
        weight: p.equityWeight,
        score,
        grade: gradeFromScore(score),
        categories: Object.fromEntries(cats.map((c) => [c.id, c.score])) as Record<
          QualityCategoryId,
          number
        >,
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    metrics,
    categories,
    composite,
    compositeGrade: gradeFromScore(composite),
    coveragePct: covered,
    contributions,
    holdings,
  };
}
