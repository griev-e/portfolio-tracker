import type { AnalystRating, InsiderSignal, Region, Sector } from "@/lib/types";

/** A live quote from the /api/quotes proxy (extended-hours aware). */
export interface LiveQuote {
  symbol: string;
  price: number;
  prevClose: number | null;
  asOf: string;
}

/**
 * Sparse live-fundamentals overlay from /api/fundamentals. Only fields the
 * provider actually returned are present; everything else falls back to the
 * bundled snapshot (or conservative defaults for unknown tickers).
 */
export interface FundamentalsPatch {
  symbol: string;
  asOf: string;
  name?: string;
  sector?: Sector;
  industry?: string;
  marketCap?: number;
  beta?: number;
  /** Annualized realized volatility, computed from price history. */
  volatility?: number;
  revenueGrowth?: number;
  epsGrowth?: number;
  /** Free-cash-flow growth, derived from Yahoo's statement modules. */
  fcfGrowth?: number;
  forwardPE?: number;
  fcfYield?: number;
  operatingMargin?: number;
  grossMargin?: number;
  /** Return on invested capital (derived from Yahoo statements, or Finnhub). */
  roic?: number;
  /** Total debt / shareholder equity, as a ratio (1.5 = 150%). */
  debtToEquity?: number;
  dividendYield?: number;
  return12m?: number;
  /** Revenue-by-region mix, normalized to 1. No keyless source — usually empty. */
  regions?: Partial<Record<Region, number>>;
  analyst?: {
    rating?: AnalystRating;
    priceTarget?: number;
    targetLow?: number;
    targetHigh?: number;
    count?: number;
  };
  insider?: {
    signal?: InsiderSignal;
    netActivity6m?: number;
    buys6m?: number;
    sells6m?: number;
  };
  earningsDate?: string | null;
  fundSectorWeights?: Partial<Record<Sector, number>>;
}

export interface QuotesResponse {
  quotes: Record<string, LiveQuote>;
  asOf: string;
}

export interface FundamentalsResponse {
  patches: Record<string, FundamentalsPatch>;
  asOf: string;
  /** Set when the server hit its fetch deadline before covering every symbol —
   *  the client schedules a follow-up to finish the overlay. */
  partial?: boolean;
}
