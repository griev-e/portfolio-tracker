import { CMA as STATIC_CMA, NDX, SPX } from "@/lib/data/benchmarks";
import { resolveBenchmark, type LiveBenchmarkFields } from "@/lib/data/assumptions";
import type { BenchmarkProfile } from "@/lib/types";
import { getAssumptions } from "./assumptions";

/**
 * Live overlay for the capital-market assumptions analytics consume.
 * `primeLiveCMA()` fetches once per session; `getCMA()` returns the live
 * risk-free rate / market volatility when available, falling back to the
 * static snapshot in lib/data/benchmarks.ts otherwise.
 *
 * The equity risk premium has no reliable live source — the trailing-earnings
 * "Fed model" estimate goes negative in a high-rate regime, so it is *not*
 * derived. It is a user-owned assumption instead (see lib/data/assumptions.ts),
 * read here from the assumptions singleton.
 *
 * `liveBenchmark()` exposes the benchmark valuation/sector aggregates fetched
 * from the SPY / QQQ proxies (P/E, dividend yield, FCF yield, sector weights,
 * realized vol, 12m return), so the benchmark profiles render live where the
 * provider supplies a value — falling back to the profile's static field.
 */
let live: {
  riskFree: number;
  marketVolatility: number;
  ndxVolatility: number;
  spx: LiveBenchmarkFields;
  ndx: LiveBenchmarkFields;
} | null = null;
let primed: Promise<void> | null = null;

export function getCMA() {
  return {
    riskFree: live?.riskFree ?? STATIC_CMA.riskFree,
    equityRiskPremium: getAssumptions().equityRiskPremium,
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

/**
 * Live valuation/sector aggregates for a benchmark, or `undefined` before the
 * CMA fetch resolves. Consumed by `resolveBenchmark` to overlay live fields
 * onto the static profile.
 */
export function liveBenchmark(id: BenchmarkProfile["id"]): LiveBenchmarkFields | undefined {
  if (!live) return undefined;
  const fields = id === "ndx" ? live.ndx : live.spx;
  // Fold the realized index vol (from ^GSPC/^NDX) in alongside the ETF fields.
  const vol = id === "ndx" ? live.ndxVolatility : live.marketVolatility;
  return { ...fields, volatility: fields.volatility ?? vol };
}

/** The fully resolved benchmark profiles (static + assumptions + live). */
export function liveBenchmarkProfiles(): { spx: BenchmarkProfile; ndx: BenchmarkProfile } {
  const a = getAssumptions();
  return {
    spx: resolveBenchmark(SPX, a, liveBenchmark("spx")),
    ndx: resolveBenchmark(NDX, a, liveBenchmark("ndx")),
  };
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
          spx: isFields(data.spx) ? data.spx : {},
          ndx: isFields(data.ndx) ? data.ndx : {},
        };
      }
    } catch {
      // snapshot fallback — getCMA() / liveBenchmark() already cover this
    }
  })();
  return primed;
}

function isFields(v: unknown): v is LiveBenchmarkFields {
  return typeof v === "object" && v !== null;
}
