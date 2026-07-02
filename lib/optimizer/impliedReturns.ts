/**
 * Black–Litterman-style implied expected returns (the "reverse optimization"
 * step, with no views).
 *
 * Bare CAPM (rf + β·ERP) makes every expected return a linear function of one
 * number, so "maximize return" degenerates into a beta sort. The equilibrium
 * alternative asks: *what returns would make the market's own cap-weighted
 * allocation of these names optimal?* Reverse-optimizing the mean-variance
 * problem gives the classic
 *
 *   π = δ · Σ w_cap,   δ = ERP / σ_m²
 *
 * where w_cap are the universe's market-cap weights, Σ is the same factor
 * covariance the rest of the risk stack uses, and δ is the risk aversion
 * implied by the market's own risk/return trade-off (the ERP earned per unit
 * of market variance). μ = rf + π is then consistent with Σ *by construction*:
 * names earn premium through their covariance with the cap-weighted portfolio,
 * not through a single shared β scalar — correlations and idiosyncratic
 * structure matter, which is exactly what the optimizer needs μ and Σ to agree
 * on.
 *
 * No views are applied (the "BL without views" equilibrium): the point is a
 * better-grounded μ, not opinion injection. Callers fall back to CAPM when any
 * name lacks a market cap — a partial cap-weight vector would silently misprice
 * the rest.
 */

/** π = δ·Σ·w_cap, with δ = erp / marketVariance. */
export function impliedExcessReturns(
  cov: number[][],
  capWeights: number[],
  erp: number,
  marketVariance: number
): number[] {
  const delta = marketVariance > 0 ? erp / marketVariance : 0;
  return cov.map((row) => {
    let s = 0;
    for (let j = 0; j < row.length; j++) s += row[j] * capWeights[j];
    return delta * s;
  });
}

/**
 * Normalized market-cap weights for a universe, or null when any cap is
 * missing/non-positive (the caller then falls back to CAPM rather than
 * mispricing the covered names against a truncated market).
 */
export function capWeightsOf(caps: (number | undefined)[]): number[] | null {
  let total = 0;
  for (const c of caps) {
    if (c === undefined || !Number.isFinite(c) || c <= 0) return null;
    total += c;
  }
  if (total <= 0) return null;
  return caps.map((c) => (c as number) / total);
}
