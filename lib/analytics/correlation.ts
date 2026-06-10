import { CMA } from "../data/benchmarks";
import { UNKNOWN_DEFAULTS } from "../data/fundamentals";
import type { Portfolio, Position } from "../types";

/**
 * Factor-model correlation estimates.
 *
 * Without per-ticker return history, pairwise correlation is estimated from a
 * single-market-factor model plus sector/industry affinity:
 *
 *   ρ_ij ≈ (β_i β_j σ_m²) / (σ_i σ_j)  +  sector/industry affinity
 *
 * The market term is the correlation implied when betas explain all common
 * variance; affinity adds the shared-industry co-movement a one-factor model
 * misses. Estimates are clamped to a plausible long-only equity range.
 */

export interface CorrInputs {
  symbol: string;
  beta: number;
  vol: number;
  sector: string;
  industry: string;
  isFund: boolean;
}

export function corrInputs(p: Position): CorrInputs {
  const f = p.fundamentals;
  return {
    symbol: p.symbol,
    beta: f?.beta ?? UNKNOWN_DEFAULTS.beta,
    vol: f?.volatility ?? UNKNOWN_DEFAULTS.volatility,
    sector: f?.sector ?? "Unknown",
    industry: f?.industry ?? "Unknown",
    isFund: !!f?.fund,
  };
}

export function pairCorrelation(a: CorrInputs, b: CorrInputs): number {
  if (a.symbol === b.symbol) return 1;
  const sm2 = CMA.marketVolatility ** 2;
  const marketTerm = (a.beta * b.beta * sm2) / (a.vol * b.vol);

  let affinity = 0;
  if (a.industry === b.industry && a.industry !== "Unknown") {
    affinity = 0.3;
  } else if (
    a.sector === b.sector &&
    a.sector !== "Unknown" &&
    a.sector !== "Diversified" // funds share the fund affinity below instead
  ) {
    affinity = 0.18;
  }
  // Broad funds co-move with everything slightly beyond their beta link.
  if (a.isFund || b.isFund) affinity += 0.06;

  return clamp(marketTerm + affinity, 0.02, 0.96);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][]; // matrix[i][j] = ρ
  /** Average pairwise correlation, weighted equally. */
  avgCorrelation: number;
  /** Most and least correlated pairs (excluding self). */
  highest: { a: string; b: string; rho: number } | null;
  lowest: { a: string; b: string; rho: number } | null;
}

export function correlationMatrix(portfolio: Portfolio): CorrelationMatrix {
  const inputs = portfolio.positions.map(corrInputs);
  const n = inputs.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(1));

  let sum = 0;
  let count = 0;
  let highest: CorrelationMatrix["highest"] = null;
  let lowest: CorrelationMatrix["lowest"] = null;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const rho = pairCorrelation(inputs[i], inputs[j]);
      matrix[i][j] = rho;
      matrix[j][i] = rho;
      sum += rho;
      count++;
      if (!highest || rho > highest.rho)
        highest = { a: inputs[i].symbol, b: inputs[j].symbol, rho };
      if (!lowest || rho < lowest.rho)
        lowest = { a: inputs[i].symbol, b: inputs[j].symbol, rho };
    }
  }

  return {
    symbols: inputs.map((x) => x.symbol),
    matrix,
    avgCorrelation: count > 0 ? sum / count : 0,
    highest,
    lowest,
  };
}

/** Covariance matrix Σ_ij = ρ_ij σ_i σ_j for the portfolio's positions. */
export function covarianceMatrix(portfolio: Portfolio): number[][] {
  const inputs = portfolio.positions.map(corrInputs);
  const { matrix } = correlationMatrix(portfolio);
  return matrix.map((row, i) =>
    row.map((rho, j) => rho * inputs[i].vol * inputs[j].vol)
  );
}
