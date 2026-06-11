import type { AnalystRating, InsiderSignal, Sector } from "@/lib/types";

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
  revenueGrowth?: number;
  epsGrowth?: number;
  forwardPE?: number;
  fcfYield?: number;
  operatingMargin?: number;
  grossMargin?: number;
  dividendYield?: number;
  return12m?: number;
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
}
