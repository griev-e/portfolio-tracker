/**
 * Shared client/server types for the AI dry-powder allocator (Rebalance page).
 *
 * The client builds a compact, enriched snapshot of the in-browser portfolio
 * (holdings never persist server-side) and POSTs it to `/api/allocate`. Claude
 * returns a structured deployment plan: how to put the available cash to work
 * across the owned holdings, sized by conviction, plus what to trim and the
 * structural gaps the book can't fill itself.
 */

export type Conviction = "high" | "medium" | "low";

/** Compact per-position snapshot sent to the allocator model. */
export interface AllocatorPosition {
  symbol: string;
  name: string;
  /** Weight of total portfolio incl. cash, decimal. */
  weight: number;
  sector: string | null;
  /** Total return on cost basis, decimal. */
  returnPct: number;
  /** Today's move vs previous close, decimal. Null without live quotes. */
  dayChangePct: number | null;
  /** Forward P/E. Null when unprofitable / unknown. */
  forwardPE: number | null;
  /** Free-cash-flow yield, decimal. */
  fcfYield: number | null;
  /** Dividend yield, decimal. */
  dividendYield: number | null;
  /** Return on invested capital, decimal. */
  roic: number | null;
  /** Forward/TTM revenue growth, decimal. */
  revenueGrowth: number | null;
  /** Beta vs S&P 500. */
  beta: number | null;
  /** Annualized volatility, decimal. */
  volatility: number | null;
  /** Analyst consensus rating, e.g. "Buy". */
  analystRating: string | null;
  /** Upside to mean price target, decimal (0.12 = +12%). Null when unknown. */
  analystUpside: number | null;
}

export interface AllocatorRequest {
  portfolio: {
    totalValue: number;
    /** Invested (ex-cash) book value. */
    equityValue: number;
    cash: number;
    cashWeight: number;
    /** Dry powder available to deploy (idle cash + any new contribution). */
    deployable: number;
    totalReturnPct: number;
    /** Sorted by weight desc; the client caps this. */
    positions: AllocatorPosition[];
  };
}

/** One recommended deployment into an owned holding. */
export interface Deployment {
  symbol: string;
  /** Share of deployable cash directed here, percent (0-100). */
  allocationPct: number;
  conviction: Conviction;
  rationale: string;
}

/** A name to trim or avoid topping up. */
export interface TrimNote {
  symbol: string;
  note: string;
}

/** A structural gap the owned names can't fill — qualitative, not tradeable. */
export interface Consideration {
  title: string;
  detail: string;
}

/** The structured deployment plan returned by the model. */
export interface AllocationPlan {
  /** Overall read on how the dry powder should be put to work. */
  thesis: string;
  /** Owned names to add to, highest conviction first. */
  deployments: Deployment[];
  /** Share of deployable cash to keep as reserve, percent. Sums to 100 with deployments. */
  reservePct: number;
  /** Names to trim or avoid topping up. */
  trims: TrimNote[];
  /** Cross-cutting gaps / diversification notes. */
  considerations: Consideration[];
  /** Single sharpest risk in the proposed deployment. */
  risk: string;
}

export interface AllocationResponse {
  plan: AllocationPlan;
  generatedAt: string;
  cached: boolean;
}
