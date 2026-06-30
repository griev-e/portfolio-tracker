import { CMA as STATIC_CMA, NDX } from "@/lib/data/benchmarks";
import {
  annualizedVol,
  fetchBenchmarkFields,
  fetchHistory,
  yf,
  type BenchmarkLiveFields,
} from "./yahoo";

export interface LiveCMA {
  riskFree: number;
  marketVolatility: number;
  /** Realized NASDAQ-100 volatility (^NDX), for the benchmark profile. */
  ndxVolatility: number;
  /** Live benchmark valuation/sector aggregates from the ETF proxies. */
  spx: BenchmarkLiveFields;
  ndx: BenchmarkLiveFields;
  asOf: string;
}

/**
 * Live capital-market assumptions: risk-free rate from the 13-week T-bill
 * (^IRX) and realized index volatility from trailing 1y closes (S&P 500 for the
 * market factor, NASDAQ-100 for the benchmark profile). Equity risk premium has
 * no observable market quote — it stays the static assumption in
 * lib/data/benchmarks.ts.
 */
const TTL = 6 * 3600_000;
let cache: { at: number; data: LiveCMA } | null = null;
let inflight: Promise<LiveCMA> | null = null;

export async function getLiveCMA(): Promise<LiveCMA> {
  const now = Date.now();
  if (cache && now - cache.at < TTL) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await build();
      cache = { at: Date.now(), data };
      return data;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function build(): Promise<LiveCMA> {
  const [irx, gspc, ndx, spyFields, qqqFields] = await Promise.allSettled([
    yf.quote("^IRX"),
    fetchHistory("^GSPC", "1y"),
    fetchHistory("^NDX", "1y"),
    fetchBenchmarkFields("SPY"),
    fetchBenchmarkFields("QQQ"),
  ]);

  let riskFree = STATIC_CMA.riskFree;
  if (irx.status === "fulfilled") {
    const q = Array.isArray(irx.value) ? irx.value[0] : irx.value;
    const price = q?.regularMarketPrice;
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      riskFree = price / 100;
    }
  }

  let marketVolatility = STATIC_CMA.marketVolatility;
  if (gspc.status === "fulfilled" && gspc.value) {
    const vol = annualizedVol(gspc.value.points.map((p) => p.c));
    if (vol !== undefined) marketVolatility = vol;
  }

  let ndxVolatility = NDX.volatility;
  if (ndx.status === "fulfilled" && ndx.value) {
    const vol = annualizedVol(ndx.value.points.map((p) => p.c));
    if (vol !== undefined) ndxVolatility = vol;
  }

  const spx = spyFields.status === "fulfilled" ? spyFields.value : {};
  const ndxFields = qqqFields.status === "fulfilled" ? qqqFields.value : {};

  return {
    riskFree,
    marketVolatility,
    ndxVolatility,
    spx,
    ndx: ndxFields,
    asOf: new Date().toISOString(),
  };
}
