import { SPX } from "../data/benchmarks";
import type { Fundamentals, Portfolio } from "../types";

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

/** Score vs benchmark: 50 = in line, saturating toward 0/100 at ±2× the scale. */
function relScore(value: number, benchmark: number, lowerIsBetter: boolean): number {
  if (benchmark === 0) return 50;
  const ratio = value / benchmark;
  const x = lowerIsBetter ? 2 - ratio : ratio;
  return Math.round(100 / (1 + Math.exp(-(x - 1) * 2.6)));
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
}

const METRIC_META: MetricMeta[] = [
  { key: "revenueGrowth", label: "Revenue Growth", benchmark: SPX.revenueGrowth, lowerIsBetter: false, format: "pct", description: "Weighted forward revenue growth across holdings", category: "growth", weight: 0.14 },
  { key: "epsGrowth", label: "EPS Growth", benchmark: SPX.epsGrowth, lowerIsBetter: false, format: "pct", description: "Weighted forward earnings-per-share growth", category: "growth", weight: 0.14 },
  { key: "fcfGrowth", label: "FCF Growth", benchmark: SPX.fcfGrowth, lowerIsBetter: false, format: "pct", description: "Weighted free-cash-flow growth", category: "growth", weight: 0.1 },
  { key: "roic", label: "ROIC", benchmark: SPX.roic, lowerIsBetter: false, format: "pct", description: "Weighted return on invested capital", category: "profitability", weight: 0.16 },
  { key: "operatingMargin", label: "Operating Margin", benchmark: SPX.operatingMargin, lowerIsBetter: false, format: "pct", description: "Weighted operating profitability", category: "profitability", weight: 0.12 },
  { key: "grossMargin", label: "Gross Margin", benchmark: SPX.grossMargin, lowerIsBetter: false, format: "pct", description: "Weighted gross profitability — pricing power proxy", category: "profitability", weight: 0.08 },
  { key: "forwardPE", label: "Forward P/E", benchmark: SPX.forwardPE, lowerIsBetter: true, format: "multiple", description: "Weighted harmonic-mean forward price/earnings", category: "valuation", weight: 0.1 },
  { key: "peg", label: "PEG Ratio", benchmark: SPX.forwardPE / (SPX.epsGrowth * 100), lowerIsBetter: true, format: "ratio", description: "Forward P/E relative to EPS growth — growth-adjusted valuation", category: "valuation", weight: 0.06 },
  { key: "fcfYield", label: "FCF Yield", benchmark: SPX.fcfYield, lowerIsBetter: false, format: "pct", description: "Weighted free-cash-flow yield", category: "income", weight: 0.07 },
  { key: "dividendYield", label: "Dividend Yield", benchmark: SPX.dividendYield, lowerIsBetter: false, format: "pct", description: "Weighted dividend yield", category: "income", weight: 0.03 },
];

/** Build one scored metric from a raw value (Infinity → scored as 3× benchmark). */
function scoreOne(meta: MetricMeta, raw: number): QualityMetric {
  const forScoring = Number.isFinite(raw) ? raw : meta.benchmark * 3;
  const score = relScore(forScoring, meta.benchmark, meta.lowerIsBetter);
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
    forwardPE: fpe,
    peg,
    fcfYield: f.fcfYield,
    dividendYield: f.dividendYield,
  };
}

/**
 * Weighted portfolio quality scorecard. All metrics are weighted by invested
 * (ex-cash) weight across holdings with fundamentals; forward P/E uses a
 * weighted harmonic mean (the correct aggregation for multiples). Metrics roll
 * up into four categories and a single composite; each holding is also graded
 * on its own with the identical scoring.
 */
export function qualityReport(portfolio: Portfolio): QualityReport {
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

  const rawAgg: Record<string, number> = {
    revenueGrowth: wavg((f) => f.revenueGrowth),
    epsGrowth,
    fcfGrowth: wavg((f) => f.fcfGrowth),
    roic: wavg((f) => f.roic),
    operatingMargin: wavg((f) => f.operatingMargin),
    grossMargin: wavg((f) => f.grossMargin),
    forwardPE,
    peg,
    fcfYield: wavg((f) => f.fcfYield),
    dividendYield: wavg((f) => f.dividendYield),
  };

  const metrics = METRIC_META.map((m) => scoreOne(m, rawAgg[m.key]));
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
      const ms = METRIC_META.map((m) => scoreOne(m, holdingRaw(p.fundamentals!)[m.key]));
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
