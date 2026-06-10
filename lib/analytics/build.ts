import { getFundamentals } from "../data/fundamentals";
import { mergeFundamentals } from "../live/merge";
import type { FundamentalsPatch, LiveQuote } from "../live/types";
import type { Portfolio, Position, RawHolding } from "../types";

export interface LiveInputs {
  quotes?: Record<string, LiveQuote>;
  patches?: Record<string, FundamentalsPatch>;
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
      return {
        ...h,
        weight: totalValue > 0 ? h.equity / totalValue : 0,
        equityWeight: equityValue > 0 ? h.equity / equityValue : 0,
        costBasis,
        returnPct: costBasis > 0 ? h.totalReturn / costBasis : 0,
        fundamentals: mergeFundamentals(
          getFundamentals(h.symbol),
          live?.patches?.[h.symbol]
        ),
        dayChange:
          h.isLivePrice && h.prevClose !== null
            ? (h.price - h.prevClose) * h.shares
            : null,
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
