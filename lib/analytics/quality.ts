import { SPX } from "../data/benchmarks";
import type { Portfolio } from "../types";

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

export interface QualityMetric {
  key: string;
  label: string;
  value: number;
  benchmark: number; // S&P 500 reference
  /** true when a lower value is better (valuation multiples). */
  lowerIsBetter: boolean;
  format: "pct" | "multiple" | "ratio";
  grade: Grade;
  /** 0–100 score used in the composite. */
  score: number;
  description: string;
}

export interface QualityReport {
  metrics: QualityMetric[];
  composite: number; // 0–100
  compositeGrade: Grade;
  coveragePct: number;
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

/**
 * Weighted portfolio quality scorecard. All metrics are weighted by invested
 * (ex-cash) weight across holdings with fundamentals; forward P/E uses a
 * weighted harmonic mean (the correct aggregation for multiples).
 */
export function qualityReport(portfolio: Portfolio): QualityReport {
  const ps = portfolio.positions.filter((p) => p.fundamentals);
  const covered = ps.reduce((s, p) => s + p.equityWeight, 0);
  const norm = covered > 0 ? covered : 1;

  const wavg = (get: (f: NonNullable<(typeof ps)[number]["fundamentals"]>) => number) =>
    ps.reduce((s, p) => s + p.equityWeight * get(p.fundamentals!), 0) / norm;

  const revenueGrowth = wavg((f) => f.revenueGrowth);
  const epsGrowth = wavg((f) => f.epsGrowth);
  const fcfGrowth = wavg((f) => f.fcfGrowth);
  const roic = wavg((f) => f.roic);
  const operatingMargin = wavg((f) => f.operatingMargin);
  const grossMargin = wavg((f) => f.grossMargin);
  const fcfYield = wavg((f) => f.fcfYield);
  const dividendYield = wavg((f) => f.dividendYield);

  // Weighted harmonic mean P/E via aggregated earnings yield. Unprofitable
  // holdings contribute zero earnings, which correctly inflates the multiple.
  const earningsYield = wavg((f) =>
    f.forwardPE && f.forwardPE > 0 ? 1 / f.forwardPE : 0
  );
  const forwardPE = earningsYield > 0 ? 1 / earningsYield : Infinity;
  const peg = epsGrowth > 0 && Number.isFinite(forwardPE) ? forwardPE / (epsGrowth * 100) : Infinity;

  const defs = [
    {
      key: "revenueGrowth",
      label: "Revenue Growth",
      value: revenueGrowth,
      benchmark: SPX.revenueGrowth,
      lowerIsBetter: false,
      format: "pct" as const,
      description: "Weighted forward revenue growth across holdings",
    },
    {
      key: "epsGrowth",
      label: "EPS Growth",
      value: epsGrowth,
      benchmark: SPX.epsGrowth,
      lowerIsBetter: false,
      format: "pct" as const,
      description: "Weighted forward earnings-per-share growth",
    },
    {
      key: "fcfGrowth",
      label: "FCF Growth",
      value: fcfGrowth,
      benchmark: SPX.fcfGrowth,
      lowerIsBetter: false,
      format: "pct" as const,
      description: "Weighted free-cash-flow growth",
    },
    {
      key: "roic",
      label: "ROIC",
      value: roic,
      benchmark: SPX.roic,
      lowerIsBetter: false,
      format: "pct" as const,
      description: "Weighted return on invested capital",
    },
    {
      key: "operatingMargin",
      label: "Operating Margin",
      value: operatingMargin,
      benchmark: SPX.operatingMargin,
      lowerIsBetter: false,
      format: "pct" as const,
      description: "Weighted operating profitability",
    },
    {
      key: "grossMargin",
      label: "Gross Margin",
      value: grossMargin,
      benchmark: SPX.grossMargin,
      lowerIsBetter: false,
      format: "pct" as const,
      description: "Weighted gross profitability — pricing power proxy",
    },
    {
      key: "forwardPE",
      label: "Forward P/E",
      value: forwardPE,
      benchmark: SPX.forwardPE,
      lowerIsBetter: true,
      format: "multiple" as const,
      description: "Weighted harmonic-mean forward price/earnings",
    },
    {
      key: "peg",
      label: "PEG Ratio",
      value: peg,
      benchmark: SPX.forwardPE / (SPX.epsGrowth * 100),
      lowerIsBetter: true,
      format: "ratio" as const,
      description: "Forward P/E relative to EPS growth — growth-adjusted valuation",
    },
    {
      key: "fcfYield",
      label: "FCF Yield",
      value: fcfYield,
      benchmark: SPX.fcfYield,
      lowerIsBetter: false,
      format: "pct" as const,
      description: "Weighted free-cash-flow yield",
    },
    {
      key: "dividendYield",
      label: "Dividend Yield",
      value: dividendYield,
      benchmark: SPX.dividendYield,
      lowerIsBetter: false,
      format: "pct" as const,
      description: "Weighted dividend yield",
    },
  ];

  const metrics: QualityMetric[] = defs.map((d) => {
    const score = relScore(
      Number.isFinite(d.value) ? d.value : d.benchmark * 3,
      d.benchmark,
      d.lowerIsBetter
    );
    return { ...d, score, grade: gradeFromScore(score) };
  });

  // Composite leans on durable quality & growth, with valuation as a check.
  const weightByKey: Record<string, number> = {
    revenueGrowth: 0.14,
    epsGrowth: 0.14,
    fcfGrowth: 0.1,
    roic: 0.16,
    operatingMargin: 0.12,
    grossMargin: 0.08,
    forwardPE: 0.1,
    peg: 0.06,
    fcfYield: 0.07,
    dividendYield: 0.03,
  };
  const composite = Math.round(
    metrics.reduce((s, m) => s + m.score * (weightByKey[m.key] ?? 0), 0)
  );

  return {
    metrics,
    composite,
    compositeGrade: gradeFromScore(composite),
    coveragePct: covered,
  };
}
