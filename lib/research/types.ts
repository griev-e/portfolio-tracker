/**
 * Shared types for the Research terminal. Kept provider-agnostic so both the
 * server proxy (lib/server/yahoo.ts) and client code can import them without
 * pulling yahoo-finance2 into the browser bundle.
 */

export type HistoryRange = "1m" | "6m" | "1y" | "5y";

export interface HistoryPoint {
  /** ISO timestamp of the bar's close. */
  t: string;
  /** Adjusted close. */
  c: number;
}

export interface HistorySeries {
  symbol: string;
  range: HistoryRange;
  currency: string;
  points: HistoryPoint[];
}

/** A single ticker-search match (equities, ETFs, funds, indices). */
export interface SymbolHit {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface SearchResponse {
  results: SymbolHit[];
}
