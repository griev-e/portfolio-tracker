/** Shared client/server types for the Intelligence page (news + AI brief). */

/** A single news story tied to one or more holdings. */
export interface NewsItem {
  /** Provider UUID — stable dedupe key across symbols. */
  id: string;
  /** The holding this story was fetched for. */
  symbol: string;
  title: string;
  publisher: string;
  link: string;
  /** ISO timestamp. */
  publishedAt: string;
  relatedTickers: string[];
}

export interface NewsResponse {
  items: NewsItem[];
  asOf: string;
}

/** Compact per-position snapshot sent to the brief generator. */
export interface BriefPosition {
  symbol: string;
  name: string;
  /** Weight of total portfolio, decimal. */
  weight: number;
  /** Today's move vs previous close, decimal. Null without live quotes. */
  dayChangePct: number | null;
  /** Total return on cost basis, decimal. */
  returnPct: number;
  sector: string | null;
  /** Next earnings date, ISO yyyy-mm-dd. */
  earningsDate: string | null;
}

export interface BriefRequest {
  portfolio: {
    totalValue: number;
    dayChangePct: number | null;
    totalReturnPct: number;
    cashWeight: number;
    /** Sorted by weight desc; the client caps this at 25. */
    positions: BriefPosition[];
  };
}

/** The structured morning brief returned by the model. */
export interface Brief {
  /** One-line take on the day. */
  headline: string;
  /** 2–3 sentence portfolio state. */
  summary: string;
  /** Notable movers, at most 4. */
  movers: { symbol: string; comment: string }[];
  /** Forward-looking items (earnings, news themes), at most 4. */
  watchItems: string[];
  /** One concentration/risk observation. */
  risk: string;
}

export interface BriefResponse {
  brief: Brief;
  generatedAt: string;
  cached: boolean;
}
