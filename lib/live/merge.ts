import type { Fundamentals } from "@/lib/types";
import type { FundamentalsPatch } from "./types";

/**
 * Field-by-field overlay of live data onto the bundled snapshot. Live wins
 * where the provider returned a value; the snapshot fills the gaps. Unknown
 * tickers with live data get promoted to full (neutral-defaulted)
 * fundamentals so research/quality/factors light up for them too.
 */
export function mergeFundamentals(
  bundled: Fundamentals | null,
  patch: FundamentalsPatch | undefined
): Fundamentals | null {
  if (!patch) return bundled;
  if (!bundled) return fromPatch(patch);

  return {
    ...bundled,
    name: patch.name ?? bundled.name,
    sector: patch.sector ?? bundled.sector,
    industry: patch.industry ?? bundled.industry,
    marketCap: patch.marketCap ?? bundled.marketCap,
    beta: patch.beta ?? bundled.beta,
    revenueGrowth: patch.revenueGrowth ?? bundled.revenueGrowth,
    epsGrowth: patch.epsGrowth ?? bundled.epsGrowth,
    forwardPE: patch.forwardPE ?? bundled.forwardPE,
    fcfYield: patch.fcfYield ?? bundled.fcfYield,
    operatingMargin: patch.operatingMargin ?? bundled.operatingMargin,
    grossMargin: patch.grossMargin ?? bundled.grossMargin,
    dividendYield: patch.dividendYield ?? bundled.dividendYield,
    return12m: patch.return12m ?? bundled.return12m,
    analyst: {
      rating: patch.analyst?.rating ?? bundled.analyst.rating,
      priceTarget: patch.analyst?.priceTarget ?? bundled.analyst.priceTarget,
      targetLow: patch.analyst?.targetLow ?? bundled.analyst.targetLow,
      targetHigh: patch.analyst?.targetHigh ?? bundled.analyst.targetHigh,
      count: patch.analyst?.count ?? bundled.analyst.count,
    },
    insider: patch.insider
      ? {
          signal: patch.insider.signal ?? bundled.insider.signal,
          netActivity6m:
            patch.insider.netActivity6m ?? bundled.insider.netActivity6m,
          buys6m: patch.insider.buys6m ?? bundled.insider.buys6m,
          sells6m: patch.insider.sells6m ?? bundled.insider.sells6m,
        }
      : bundled.insider,
    earningsDate: patch.earningsDate ?? bundled.earningsDate,
    fund: patch.fundSectorWeights
      ? { sectorWeights: patch.fundSectorWeights }
      : bundled.fund,
    live: true,
  };
}

/** Build full fundamentals for a ticker the bundle doesn't know. */
function fromPatch(patch: FundamentalsPatch): Fundamentals {
  const beta = patch.beta ?? 1.0;
  return {
    symbol: patch.symbol,
    name: patch.name ?? patch.symbol,
    sector: patch.sector ?? "Unknown",
    industry: patch.industry ?? "Unknown",
    regions: { US: 1 },
    marketCap: patch.marketCap ?? 0,
    beta,
    // No realized-vol feed — approximate from beta, clamped to a sane band.
    volatility: Math.min(0.85, Math.max(0.18, 0.12 + 0.16 * beta)),
    revenueGrowth: patch.revenueGrowth ?? 0.05,
    epsGrowth: patch.epsGrowth ?? 0.08,
    fcfGrowth: patch.revenueGrowth ?? 0.05,
    forwardPE: patch.forwardPE ?? null,
    fcfYield: patch.fcfYield ?? 0.03,
    roic: 0.12,
    operatingMargin: patch.operatingMargin ?? 0.14,
    grossMargin: patch.grossMargin ?? 0.4,
    dividendYield: patch.dividendYield ?? 0,
    return12m: patch.return12m ?? 0.08,
    analyst: {
      rating: patch.analyst?.rating ?? "Hold",
      priceTarget: patch.analyst?.priceTarget ?? 0,
      targetLow: patch.analyst?.targetLow ?? 0,
      targetHigh: patch.analyst?.targetHigh ?? 0,
      count: patch.analyst?.count ?? 0,
    },
    insider: {
      signal: patch.insider?.signal ?? "Neutral",
      netActivity6m: patch.insider?.netActivity6m ?? 0,
      buys6m: patch.insider?.buys6m ?? 0,
      sells6m: patch.insider?.sells6m ?? 0,
    },
    earningsDate: patch.earningsDate ?? null,
    ...(patch.fundSectorWeights
      ? { fund: { sectorWeights: patch.fundSectorWeights } }
      : {}),
    live: true,
  };
}
