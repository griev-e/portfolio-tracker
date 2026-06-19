import { CMA } from "../data/benchmarks";
import { UNKNOWN_DEFAULTS } from "../data/fundamentals";
import type { Portfolio, Position } from "../types";

/**
 * Factor-model covariance & correlation estimates.
 *
 * Without per-ticker return history, co-movement is modelled with a small set of
 * shared factors. The covariance Σ is **assembled so that it is positive
 * semi-definite by construction** — there is no correlation clamp and no
 * after-the-fact projection. Σ is the sum of PSD pieces:
 *
 *   Σ = β βᵀ σ_m²                    market factor (rank-1, PSD)
 *     + Σ_g  a_g · (v_g v_gᵀ)        one shared factor per affinity group (each PSD)
 *     + diag(d)                      idiosyncratic, d_i ≥ 0
 *
 * Each affinity factor g has loading σ_i on its members and 0 elsewhere, so two
 * members contribute a_g · σ_i σ_j to their covariance — the same additive
 * affinity the previous heuristic applied on the correlation scale. The group
 * co-movement variances reproduce the old magnitudes pairwise:
 *
 *   - same sector            0.18   (sector factor)
 *   - same industry          0.30   (sector factor 0.18 + a 0.12 industry top-up;
 *                                    sector-less names like broad ETFs get the
 *                                    full 0.30 from the industry factor alone)
 *   - broad fund ↔ fund      0.06   (fund factor)
 *
 * The idiosyncratic diagonal tops each name up to its standalone variance σ_i²,
 * floored at `DIAG_FLOOR · σ_i²` so Σ stays strictly positive-definite even in
 * the incoherent case where the market + affinity factors already over-explain
 * σ_i² (a low-vol / high-beta name where β_i σ_m > σ_i). The floor inflates such
 * a diagonal slightly — an accepted cost of guaranteeing PSD.
 *
 * The displayed correlation matrix is **derived from this Σ** — ρ_ij =
 * Σ_ij / √(Σ_ii Σ_jj), diagonal forced to 1 — so the heatmap and the risk math
 * in `risk.ts` share a single source of truth.
 */

/** Affinity group co-movement variances (on the correlation scale). */
const SECTOR_VAR = 0.18;
const INDUSTRY_VAR = 0.3;
const FUND_VAR = 0.06;
/** Minimum idiosyncratic fraction of σ_i² kept on the diagonal (keeps Σ PD). */
const DIAG_FLOOR = 0.01;

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

interface Factor {
  key: string;
  /** Co-movement variance contributed when two members share this factor. */
  variance: number;
}

/**
 * Shared factors a name loads on. Precedence matches the old heuristic: a known
 * industry takes the industry factor, otherwise a known (non-diversified) sector
 * takes the sector factor, plus the broad-fund factor when applicable.
 *
 * A sectored name carries both its sector factor (0.18) and an industry top-up
 * (0.12) so two same-industry names reach 0.30 while two same-sector names stay
 * at 0.18. A sector-less name (e.g. a broad ETF, sector "Diversified") instead
 * gets the full 0.30 on the industry factor, since it has no sector factor to
 * build on — so two same-industry ETFs still reach 0.30.
 */
function factorsFor(x: CorrInputs): Factor[] {
  const factors: Factor[] = [];
  const hasSector = x.sector !== "Unknown" && x.sector !== "Diversified";
  const hasIndustry = x.industry !== "Unknown";
  if (hasSector) factors.push({ key: `sec:${x.sector}`, variance: SECTOR_VAR });
  if (hasIndustry) {
    factors.push({
      key: `ind:${x.industry}`,
      variance: hasSector ? INDUSTRY_VAR - SECTOR_VAR : INDUSTRY_VAR,
    });
  }
  if (x.isFund) factors.push({ key: "fund", variance: FUND_VAR });
  return factors;
}

/**
 * Structural factor covariance Σ for a set of names — PSD by construction.
 * This is the single source of truth feeding both `covarianceMatrix` and the
 * derived `correlationMatrix`.
 */
export function factorCovariance(inputs: CorrInputs[]): number[][] {
  const n = inputs.length;
  const sm2 = CMA.marketVolatility ** 2;
  const factors = inputs.map(factorsFor);
  const factorMaps = factors.map(
    (fs) => new Map(fs.map((f) => [f.key, f.variance]))
  );

  // Idiosyncratic diagonal: top each name up to σ_i², floored so the market and
  // affinity factors can't drive d_i below DIAG_FLOOR·σ_i² (keeps Σ strictly PD).
  const d = inputs.map((x, i) => {
    const groupVar = factors[i].reduce((s, f) => s + f.variance, 0);
    const raw = x.vol * x.vol * (1 - groupVar) - x.beta * x.beta * sm2;
    return Math.max(raw, DIAG_FLOOR * x.vol * x.vol);
  });

  const cov: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      // Market factor.
      let s = inputs[i].beta * inputs[j].beta * sm2;
      // Shared affinity factors (when i === j this sums the name's own group
      // variances, σ_i² · Σ_g a_g).
      for (const [key, variance] of factorMaps[i]) {
        if (factorMaps[j].has(key)) s += variance * inputs[i].vol * inputs[j].vol;
      }
      if (i === j) s += d[i];
      cov[i][j] = s;
      cov[j][i] = s;
    }
  }
  return cov;
}

function corrFromCov(cov: number[][], i: number, j: number): number {
  if (i === j) return 1;
  const denom = Math.sqrt(cov[i][i] * cov[j][j]);
  return denom > 0 ? cov[i][j] / denom : 0;
}

/**
 * Pairwise correlation derived from the structural covariance — kept as a
 * helper, but it reads from the same PSD Σ the matrices use.
 */
export function pairCorrelation(a: CorrInputs, b: CorrInputs): number {
  if (a.symbol === b.symbol) return 1;
  const cov = factorCovariance([a, b]);
  return corrFromCov(cov, 0, 1);
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
  const cov = factorCovariance(inputs);
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(1));

  let sum = 0;
  let count = 0;
  let highest: CorrelationMatrix["highest"] = null;
  let lowest: CorrelationMatrix["lowest"] = null;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const rho = corrFromCov(cov, i, j);
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

/** Covariance matrix Σ for the portfolio's positions (PSD by construction). */
export function covarianceMatrix(portfolio: Portfolio): number[][] {
  return factorCovariance(portfolio.positions.map(corrInputs));
}
