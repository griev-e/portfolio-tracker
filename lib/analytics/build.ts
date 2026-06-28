import { getFundamentals } from "../data/fundamentals";
import { mergeFundamentals } from "../live/merge";
import type { FundamentalsPatch, LiveQuote } from "../live/types";
import type {
  DataCoverage,
  Fundamentals,
  Portfolio,
  Position,
  RawHolding,
} from "../types";

export interface LiveInputs {
  quotes?: Record<string, LiveQuote>;
  patches?: Record<string, FundamentalsPatch>;
  /**
   * Pre-merged fundamentals by symbol. When supplied, `buildPortfolio` uses it
   * instead of re-running `mergeFundamentals` per position — letting the caller
   * memoize the (slow-moving) fundamentals merge on the patch set alone, so a
   * 60s quote tick reprices without re-merging fundamentals. Falls back to the
   * inline merge when absent (tests, the report page).
   */
  fundamentals?: Map<string, Fundamentals | null>;
}

/**
 * Merge the bundled snapshot with any live patch, per symbol. Pure and keyed
 * only on the symbol set + patches, so the store can memoize it independently of
 * quotes (which change every minute) — see `buildPortfolio`'s `fundamentals`.
 */
export function mergeAllFundamentals(
  symbols: string[],
  patches?: Record<string, FundamentalsPatch>
): Map<string, Fundamentals | null> {
  const out = new Map<string, Fundamentals | null>();
  for (const symbol of symbols) {
    if (out.has(symbol)) continue;
    out.set(symbol, mergeFundamentals(getFundamentals(symbol), patches?.[symbol]));
  }
  return out;
}

/**
 * Roll up a holding's data liveness from its live-price flag and its
 * fundamentals coverage. `live` only when both the price and the risk-critical
 * fundamentals are live; `fallback` when neither is.
 */
function dataSourceFor(
  isLivePrice: boolean,
  fundamentals: Fundamentals | null
): DataCoverage {
  const coverage = fundamentals?.provenance?.coverage ?? "fallback";
  if (isLivePrice && coverage === "live") return "live";
  if (!isLivePrice && coverage === "fallback") return "fallback";
  return "partial";
}

/**
 * Enriches raw holdings with weights and fundamentals into a Portfolio.
 *
 * With live quotes, the CSV stays the source of truth for shares and cost
 * basis while price / equity / P&L reprice from the market; without them the
 * imported values are used untouched. Live fundamentals overlay the bundled
 * snapshot field-by-field.
 */
export function buildPortfolio(
  holdings: RawHolding[],
  cash: number,
  asOf: string,
  live?: LiveInputs
): Portfolio {
  const repriced = holdings.map((h) => {
    const q = live?.quotes?.[h.symbol];
    if (!q) {
      return { ...h, isLivePrice: false, prevClose: null as number | null };
    }
    const equity = h.shares * q.price;
    return {
      ...h,
      price: q.price,
      equity,
      totalReturn: equity - h.shares * h.averageCost,
      isLivePrice: true,
      prevClose: q.prevClose,
    };
  });

  const equityValue = repriced.reduce((s, h) => s + h.equity, 0);
  const totalValue = equityValue + cash;

  const positions: Position[] = repriced
    .map((h) => {
      const costBasis = h.shares * h.averageCost;
      const fundamentals = live?.fundamentals
        ? (live.fundamentals.get(h.symbol) ??
           mergeFundamentals(getFundamentals(h.symbol), live?.patches?.[h.symbol]))
        : mergeFundamentals(getFundamentals(h.symbol), live?.patches?.[h.symbol]);
      return {
        ...h,
        weight: totalValue > 0 ? h.equity / totalValue : 0,
        equityWeight: equityValue > 0 ? h.equity / equityValue : 0,
        costBasis,
        returnPct: costBasis > 0 ? h.totalReturn / costBasis : 0,
        fundamentals,
        dayChange:
          h.isLivePrice && h.prevClose !== null
            ? (h.price - h.prevClose) * h.shares
            : null,
        dataSource: dataSourceFor(h.isLivePrice, fundamentals),
      };
    })
    .sort((a, b) => b.equity - a.equity);

  const totalCostBasis = positions.reduce((s, p) => s + p.costBasis, 0);
  const totalReturn = positions.reduce((s, p) => s + p.totalReturn, 0);

  const livePositions = positions.filter((p) => p.dayChange !== null);
  const dayChange =
    livePositions.length > 0
      ? livePositions.reduce((s, p) => s + (p.dayChange ?? 0), 0)
      : null;

  return {
    positions,
    cash,
    equityValue,
    totalValue,
    totalCostBasis,
    totalReturn,
    totalReturnPct: totalCostBasis > 0 ? totalReturn / totalCostBasis : 0,
    cashWeight: totalValue > 0 ? cash / totalValue : 0,
    asOf,
    dayChange,
    dayChangePct:
      dayChange !== null && totalValue - dayChange > 0
        ? dayChange / (totalValue - dayChange)
        : null,
  };
}
