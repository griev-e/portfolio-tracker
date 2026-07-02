import { buildPortfolio } from "../analytics/build";
import type { Fundamentals, Portfolio, RawHolding } from "../types";

/**
 * Test helpers for building portfolios. Tests run against the real
 * `buildPortfolio` path so the `Position` objects (weights, fundamentals
 * merge, P&L) match exactly what the app produces.
 */

export function holding(
  partial: Partial<RawHolding> & { symbol: string }
): RawHolding {
  const shares = partial.shares ?? 10;
  const price = partial.price ?? 100;
  const averageCost = partial.averageCost ?? price;
  const equity = partial.equity ?? shares * price;
  return {
    name: partial.name ?? partial.symbol,
    symbol: partial.symbol,
    shares,
    price,
    averageCost,
    equity,
    totalReturn: partial.totalReturn ?? equity - shares * averageCost,
  };
}

/**
 * Build a portfolio with fundamentals attached. There is no bundled snapshot
 * anymore, so tests supply fundamentals explicitly: every holding gets the
 * neutral `fundamentals()` by default, overridable per symbol via `funds`
 * (pass `null` to simulate a holding with no live data).
 */
export function makePortfolio(
  holdings: RawHolding[],
  cash = 0,
  funds?: Record<string, Partial<Fundamentals> | null>
): Portfolio {
  const fmap = new Map<string, Fundamentals | null>();
  for (const h of holdings) {
    if (funds && h.symbol in funds) {
      const o = funds[h.symbol];
      fmap.set(h.symbol, o === null ? null : fundamentals({ symbol: h.symbol, ...o }));
    } else {
      fmap.set(h.symbol, fundamentals({ symbol: h.symbol }));
    }
  }
  return buildPortfolio(holdings, cash, "2026-06-10T00:00:00.000Z", {
    fundamentals: fmap,
  });
}

/**
 * A neutral, broad-market-ish `Fundamentals` for tests that need to feed the
 * pure analytics (factors, rebalance) directly rather than through the
 * snapshot. Override any field via `partial`.
 */
export function fundamentals(
  partial: Partial<Fundamentals> & { symbol: string }
): Fundamentals {
  return {
    name: partial.symbol,
    sector: "Technology",
    industry: "Software",
    regions: { US: 1 },
    marketCap: 5e10,
    beta: 1.0,
    volatility: 0.28,
    debtToEquity: 0.8,
    revenueGrowth: 0.07,
    epsGrowth: 0.1,
    fcfGrowth: 0.08,
    forwardPE: 21,
    fcfYield: 0.038,
    roic: 0.14,
    operatingMargin: 0.16,
    grossMargin: 0.45,
    dividendYield: 0.013,
    return12m: 0.1,
    analyst: { rating: "Hold", priceTarget: 0, targetLow: 0, targetHigh: 0, count: 0 },
    insider: { signal: "Neutral", netActivity6m: 0, buys6m: 0, sells6m: 0 },
    earningsDate: null,
    ...partial,
  };
}
