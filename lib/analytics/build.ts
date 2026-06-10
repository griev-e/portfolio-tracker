import { getFundamentals } from "../data/fundamentals";
import type { Portfolio, Position, RawHolding } from "../types";

/** Enriches raw holdings with weights and fundamentals into a Portfolio. */
export function buildPortfolio(
  holdings: RawHolding[],
  cash: number,
  asOf: string
): Portfolio {
  const equityValue = holdings.reduce((s, h) => s + h.equity, 0);
  const totalValue = equityValue + cash;

  const positions: Position[] = holdings
    .map((h) => {
      const costBasis = h.shares * h.averageCost;
      return {
        ...h,
        weight: totalValue > 0 ? h.equity / totalValue : 0,
        equityWeight: equityValue > 0 ? h.equity / equityValue : 0,
        costBasis,
        returnPct: costBasis > 0 ? h.totalReturn / costBasis : 0,
        fundamentals: getFundamentals(h.symbol),
      };
    })
    .sort((a, b) => b.equity - a.equity);

  const totalCostBasis = positions.reduce((s, p) => s + p.costBasis, 0);
  const totalReturn = positions.reduce((s, p) => s + p.totalReturn, 0);

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
  };
}
