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
}

/** A holding enriched with weights and fundamentals. */
export interface Position extends RawHolding {
  weight: number; // weight of total portfolio incl. cash
  equityWeight: number; // weight of invested (ex-cash) book
  costBasis: number;
  returnPct: number; // totalReturn / costBasis
  fundamentals: Fundamentals | null;
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
