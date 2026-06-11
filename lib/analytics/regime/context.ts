import { at, percentileRank, type Series } from "./mathx";

/**
 * Aligned market data plus a memoized indicator cache. Indicators are derived
 * series (e.g. "average sector correlation") computed once across the whole
 * date axis, so scoring "where does today sit in this indicator's own
 * history?" is cheap at every replay step.
 */
export interface MarketContext {
  dates: string[];
  series: Record<string, Series>;
  s(symbol: string): Series;
  has(symbol: string): boolean;
  /** Compute (once) and return a derived indicator across the whole axis. */
  indicator(key: string, fn: (t: number) => number | null): Series;
  /**
   * Percentile (0…1) of an indicator's value at t within its own trailing
   * `lookback` sessions. Null when the indicator lacks enough history to
   * make the comparison honest.
   */
  pctl(
    key: string,
    fn: (t: number) => number | null,
    t: number,
    lookback?: number
  ): number | null;
}

const EMPTY: Series = [];

export function buildContext(
  dates: string[],
  series: Record<string, Series>
): MarketContext {
  const memo = new Map<string, Series>();

  const indicator = (key: string, fn: (t: number) => number | null): Series => {
    let cached = memo.get(key);
    if (!cached) {
      cached = dates.map((_, t) => fn(t));
      memo.set(key, cached);
    }
    return cached;
  };

  const pctl = (
    key: string,
    fn: (t: number) => number | null,
    t: number,
    lookback = 252
  ): number | null => {
    const ind = indicator(key, fn);
    const v = at(ind, t);
    if (v === null) return null;
    const hist: number[] = [];
    for (let i = Math.max(0, t - lookback); i <= t; i++) {
      const x = at(ind, i);
      if (x !== null) hist.push(x);
    }
    // Demand a real distribution to rank against, not a stub.
    if (hist.length < Math.max(40, lookback * 0.5)) return null;
    return percentileRank(hist, v);
  };

  return {
    dates,
    series,
    s: (symbol) => series[symbol] ?? EMPTY,
    has: (symbol) => symbol in series,
    indicator,
    pctl,
  };
}
