import type { FactorScores, Fundamentals, Portfolio } from "../types";

/**
 * Style-factor scoring on a 0–100 scale, centered so a broad-market profile
 * lands near 50. Each input is squashed through a logistic curve:
 * score = 100 / (1 + e^-((x - mid) / spread)).
 */
function squash(x: number, mid: number, spread: number): number {
  return 100 / (1 + Math.exp(-(x - mid) / spread));
}

export function factorScores(f: Fundamentals): FactorScores {
  const growth =
    0.4 * squash(f.revenueGrowth, 0.07, 0.07) +
    0.35 * squash(f.epsGrowth, 0.1, 0.09) +
    0.25 * squash(f.fcfGrowth, 0.08, 0.1);

  const earningsYield = f.forwardPE && f.forwardPE > 0 ? 1 / f.forwardPE : 0;
  const value =
    0.5 * squash(earningsYield, 0.047, 0.018) +
    0.35 * squash(f.fcfYield, 0.038, 0.02) +
    0.15 * squash(f.dividendYield, 0.013, 0.012);

  const quality =
    0.45 * squash(f.roic, 0.14, 0.08) +
    0.35 * squash(f.operatingMargin, 0.16, 0.1) +
    0.2 * squash(f.grossMargin, 0.45, 0.18);

  const momentum = squash(f.return12m, 0.1, 0.18);

  return {
    growth: round1(growth),
    value: round1(value),
    quality: round1(quality),
    momentum: round1(momentum),
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export interface PortfolioFactors extends FactorScores {
  /** Per-position scores for the holdings drill-down. */
  byPosition: { symbol: string; weight: number; scores: FactorScores }[];
  coveragePct: number;
}

export function portfolioFactors(portfolio: Portfolio): PortfolioFactors {
  let g = 0;
  let v = 0;
  let q = 0;
  let m = 0;
  let covered = 0;
  const byPosition: PortfolioFactors["byPosition"] = [];

  for (const p of portfolio.positions) {
    if (!p.fundamentals) continue;
    const scores = factorScores(p.fundamentals);
    byPosition.push({ symbol: p.symbol, weight: p.equityWeight, scores });
    covered += p.equityWeight;
    g += p.equityWeight * scores.growth;
    v += p.equityWeight * scores.value;
    q += p.equityWeight * scores.quality;
    m += p.equityWeight * scores.momentum;
  }

  const norm = covered > 0 ? covered : 1;
  return {
    growth: round1(g / norm),
    value: round1(v / norm),
    quality: round1(q / norm),
    momentum: round1(m / norm),
    byPosition: byPosition.sort((a, b) => b.weight - a.weight),
    coveragePct: covered,
  };
}
