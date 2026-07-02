/** A single imported position, straight from the CSV. */
export interface RawHolding {
  name: string;
  symbol: string;
  shares: number;
  price: number;
  averageCost: number;
  /** Dollar P&L. The importer auto-detects % vs $ and normalizes to dollars. */
  totalReturn: number;
  equity: number;
}

export type Region = "US" | "Europe" | "Asia-Pacific" | "Emerging";

export type Sector =
  | "Technology"
  | "Communication Services"
  | "Consumer Discretionary"
  | "Consumer Staples"
  | "Financials"
  | "Health Care"
  | "Industrials"
  | "Energy"
  | "Materials"
  | "Utilities"
  | "Real Estate"
  | "Diversified"
  | "Unknown";

export type AnalystRating =
  | "Strong Buy"
  | "Buy"
  | "Hold"
  | "Sell"
  | "Strong Sell";

export type InsiderSignal = "Buying" | "Neutral" | "Selling";

/** Where a single value came from: a live provider, or the bundled/default fallback. */
export type FieldSource = "live" | "fallback";

/**
 * Roll-up of how live a holding's data is:
 *  - `live`     — every risk-critical field is from a live provider
 *  - `partial`  — some critical fields are live, some fell back
 *  - `fallback` — nothing live; running on the bundled snapshot / defaults
 */
export type DataCoverage = "live" | "partial" | "fallback";

/**
 * Per-field provenance for a security's fundamentals, plus a coverage roll-up.
 * Lets the UI mark stale values explicitly instead of silently presenting the
 * bundled snapshot as if it were live.
 */
export interface FundamentalsProvenance {
  /** Source of each tracked field. An absent field is treated as `fallback`. */
  fields: Partial<Record<keyof Fundamentals, FieldSource>>;
  /** Roll-up over the risk-critical fields (beta, volatility, sector). */
  coverage: DataCoverage;
}

/** Fundamental snapshot for a security. Bundled dataset; swappable for a live provider. */
export interface Fundamentals {
  symbol: string;
  name: string;
  sector: Sector;
  industry: string;
  /** Revenue exposure by region; values sum to 1. */
  regions: Partial<Record<Region, number>>;
  marketCap: number; // USD
  beta: number; // vs S&P 500
  volatility: number; // annualized, e.g. 0.32
  revenueGrowth: number; // forward / TTM blend, decimal
  epsGrowth: number; // forward, decimal
  fcfGrowth: number; // decimal
  forwardPE: number | null; // null when unprofitable
  fcfYield: number; // decimal
  roic: number; // decimal
  /** Total debt / shareholder equity ratio; null when the provider has none
   *  (never fabricated — leverage is scored neutral without data). */
  debtToEquity: number | null;
  operatingMargin: number; // decimal
  grossMargin: number; // decimal
  dividendYield: number; // decimal
  return12m: number; // trailing 12m price return, decimal
  analyst: {
    rating: AnalystRating;
    /** Mean 12-month price target. */
    priceTarget: number;
    targetLow: number;
    targetHigh: number;
    count: number;
  };
  insider: {
    signal: InsiderSignal;
    /** Net insider transactions over trailing 6 months, USD (negative = net selling). */
    netActivity6m: number;
    buys6m: number;
    sells6m: number;
  };
  /** Next earnings date, ISO yyyy-mm-dd. Null for funds. */
  earningsDate: string | null;
  /** Present for ETFs/funds: look-through sector mix used in exposure math. */
  fund?: {
    sectorWeights: Partial<Record<Sector, number>>;
  };
  /** True when live provider data has been merged over the snapshot. */
  live?: boolean;
  /** Per-field source + coverage roll-up. Absent on legacy/test fixtures. */
  provenance?: FundamentalsProvenance;
}

/** A holding enriched with weights and fundamentals. */
export interface Position extends RawHolding {
  weight: number; // weight of total portfolio incl. cash
  equityWeight: number; // weight of invested (ex-cash) book
  costBasis: number;
  returnPct: number; // totalReturn / costBasis
  fundamentals: Fundamentals | null;
  /** Set when a live quote repriced this position. */
  isLivePrice: boolean;
  prevClose: number | null;
  /** Today's P&L in dollars (live quote vs previous close), null without quotes. */
  dayChange: number | null;
  /**
   * Roll-up of data liveness for this holding: combines the live quote
   * (`isLivePrice`) with the fundamentals coverage. `live` only when both the
   * price and the risk-critical fundamentals come from a live provider.
   */
  dataSource: DataCoverage;
}

export interface Portfolio {
  positions: Position[];
  cash: number;
  equityValue: number; // sum of position equity
  totalValue: number; // equity + cash
  totalCostBasis: number;
  totalReturn: number;
  totalReturnPct: number;
  cashWeight: number;
  asOf: string; // ISO timestamp of import
  /** Today's total P&L across live-priced positions; null when no quotes. */
  dayChange: number | null;
  dayChangePct: number | null;
}

export interface BenchmarkProfile {
  id: "spx" | "ndx";
  name: string;
  ticker: string;
  forwardPE: number;
  revenueGrowth: number;
  epsGrowth: number;
  fcfGrowth: number;
  roic: number;
  operatingMargin: number;
  grossMargin: number;
  dividendYield: number;
  volatility: number;
  beta: number;
  return12m: number;
  fcfYield: number;
  /** Sector weights, decimal, sums to ~1. */
  sectorWeights: Partial<Record<Sector, number>>;
  factorScores: FactorScores;
}

export interface FactorScores {
  growth: number; // 0..100
  value: number;
  quality: number;
  momentum: number;
}

export interface ScenarioShock {
  kind: "stock" | "market" | "rates";
  /** for kind=stock */
  symbol?: string;
  /** stock/market: price move as decimal (-0.2 = -20%); rates: change in % points (1 = +100bps) */
  magnitude: number;
}

export interface ScenarioImpact {
  symbol: string;
  name: string;
  weight: number;
  shockPct: number; // estimated price move for this holding
  dollarImpact: number;
  isDirect: boolean;
}

export interface ScenarioResult {
  label: string;
  portfolioImpactPct: number; // on total value incl. cash
  dollarImpact: number;
  newTotalValue: number;
  impacts: ScenarioImpact[];
}
