import { CMA as STATIC_CMA, NDX } from "@/lib/data/benchmarks";
import type { BenchmarkProfile } from "@/lib/types";

/**
 * Live overlay for the capital-market assumptions analytics consume.
 * `primeLiveCMA()` fetches once per session; `getCMA()` returns the live
 * risk-free rate / market volatility when available, falling back to the
 * static snapshot in lib/data/benchmarks.ts otherwise. Equity risk premium
 * has no live source and always comes from the static assumption.
 *
 * `liveBenchmarkVolatility()` exposes the realized S&P 500 / NASDAQ-100
 * volatility from the same fetch, so the benchmark profiles render live vol
 * instead of their static figure — falling back to the profile's static value.
 */
let live: {
  riskFree: number;
  marketVolatility: number;
  ndxVolatility: number;
} | null = null;
let primed: Promise<void> | null = null;

export function getCMA() {
  return {
    riskFree: live?.riskFree ?? STATIC_CMA.riskFree,
    equityRiskPremium: STATIC_CMA.equityRiskPremium,
    marketVolatility: live?.marketVolatility ?? STATIC_CMA.marketVolatility,
  };
}

/**
 * Realized volatility for a benchmark profile, live when primed. S&P 500 maps
 * to the live market volatility; NASDAQ-100 to its own realized series. Any
 * other profile (or before priming) falls back to the profile's static vol.
 */
export function liveBenchmarkVolatility(profile: BenchmarkProfile): number {
  if (!live) return profile.volatility;
  if (profile.id === "spx") return live.marketVolatility;
  if (profile.id === "ndx") return live.ndxVolatility;
  return profile.volatility;
}

export function primeLiveCMA(): Promise<void> {
  if (primed) return primed;
  primed = (async () => {
    try {
      const res = await fetch("/api/cma");
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (
        typeof data.riskFree === "number" &&
        typeof data.marketVolatility === "number"
      ) {
        live = {
          riskFree: data.riskFree,
          marketVolatility: data.marketVolatility,
          ndxVolatility:
            typeof data.ndxVolatility === "number"
              ? data.ndxVolatility
              : NDX.volatility,
        };
      }
    } catch {
      // snapshot fallback — getCMA() / liveBenchmarkVolatility() already cover this
    }
  })();
  return primed;
}
