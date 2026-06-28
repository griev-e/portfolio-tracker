/**
 * Shared client/server types for the AI Optimizer (Optimizer page).
 *
 * The optimizer has two layers:
 *
 *   1. A deterministic, client-side quantitative core (`lib/optimizer/optimize.ts`)
 *      that solves a constrained portfolio-optimization problem against the same
 *      factor covariance the Risk page uses — mean-variance, min-variance, risk
 *      parity, max diversification, income, quality, etc. It returns target
 *      weights, the resulting risk/return metrics, an efficient frontier, and a
 *      trade list. No network, instant, repeatable.
 *
 *   2. An AI reasoning layer (`lib/server/optimizer.ts`, Claude Sonnet 4.6) that
 *      reviews the quantitative solution and writes the institutional read: the
 *      thesis, what the optimizer is doing and why, the sharpest tradeoffs and
 *      risks, and a calibrated verdict. The holdings never persist server-side,
 *      so the compact snapshot travels with the request, exactly like the
 *      dry-powder allocator.
 */

/** Optimization objectives exposed as presets on the page. */
export type ObjectiveId =
  | "sharpe"
  | "min-vol"
  | "risk-parity"
  | "max-div"
  | "max-return"
  | "income"
  | "quality"
  | "equal";

export interface OptimizerConstraints {
  /** Per-name cap on the invested book, decimal (0.30 = 30%). */
  maxWeight: number;
  /**
   * Minimum invested weight for a currently-held position, decimal. Acts as a
   * floor that keeps the optimizer from fully exiting a name (unless `allowExit`
   * is set). Ignored when `allowExit` is true.
   */
  minWeight: number;
  /**
   * When true, the optimizer may drive any position to zero (a full exit). When
   * false (default), held positions keep at least `minWeight`.
   */
  allowExit: boolean;
  /**
   * Minimum trade size in dollars. Moves whose dollar value is below this are
   * reported as `hold` (and excluded from the trade count) rather than surfaced
   * as unactionable odd-lot orders. The solved target weights are unchanged;
   * this only cleans the trade list. Defaults to $1 when unset.
   */
  minTradeSize?: number;
}

/** Risk/return characteristics of a weight vector, on the total book (incl. cash). */
export interface PortfolioMetrics {
  /** CAPM expected return, decimal annual. */
  expectedReturn: number;
  /** Annualized volatility, decimal. */
  volatility: number;
  sharpe: number;
  /** Diversification ratio on the invested book (>1 = diversification working). */
  diversification: number;
  /** Effective number of holdings, 1 / Σwᵢ² on the invested book. */
  effectiveN: number;
  /** Largest single invested weight, decimal. */
  topWeight: number;
  /** Portfolio dividend yield, decimal. */
  yield: number;
  /** Portfolio beta incl. cash drag. */
  beta: number;
}

/** One holding's before → after in the optimized solution. */
export interface OptimizedPosition {
  symbol: string;
  name: string;
  /** Current weight on the invested book, decimal. */
  currentWeight: number;
  /** Optimized weight on the invested book, decimal. */
  targetWeight: number;
  /** Current weight on the total book (incl. cash), decimal. */
  currentTotalWeight: number;
  /** Optimized weight on the total book (incl. cash), decimal. */
  targetTotalWeight: number;
  /** targetWeight − currentWeight, decimal. */
  deltaWeight: number;
  /** Dollars to trade to reach the target. */
  dollarDelta: number;
  /** Estimated shares to trade (dollarDelta / price). */
  shares: number;
  price: number;
  sector: string | null;
  action: "buy" | "sell" | "hold" | "exit";
}

/** A point on the efficient frontier, on total-book axes. */
export interface FrontierPoint {
  vol: number;
  ret: number;
}

/** The full quantitative optimization result. */
export interface OptimizerResult {
  objective: ObjectiveId;
  constraints: OptimizerConstraints;
  metricsBefore: PortfolioMetrics;
  metricsAfter: PortfolioMetrics;
  positions: OptimizedPosition[];
  frontier: FrontierPoint[];
  /** Current portfolio point (total-book axes). */
  current: FrontierPoint;
  /** Optimized portfolio point (total-book axes). */
  target: FrontierPoint;
  /** One-way turnover to implement, decimal of total value. */
  turnover: number;
  tradeCount: number;
  buys: number;
  sells: number;
  /** Cash weight held constant through the optimization, decimal. */
  cashWeight: number;
  /**
   * Whether the solver reached a stationary point for the chosen objective
   * (vs. exhausting its iteration budget while still improving). False is rare
   * and signals the metrics should be read as approximate — surface it in the UI.
   */
  converged: boolean;
}

/* ───────────────────────────── AI reasoning layer ───────────────────────── */

export type Confidence = "high" | "medium" | "low";
export type ShiftAction = "increase" | "decrease" | "exit" | "initiate";

/** Compact per-position shift sent to the reasoning model. */
export interface OptimizerShift {
  symbol: string;
  name: string;
  sector: string | null;
  currentPct: number;
  targetPct: number;
  deltaPct: number;
  /** Forward P/E. Null when unprofitable / unknown. */
  forwardPE: number | null;
  /** Dividend yield, percent. */
  dividendYieldPct: number | null;
  /** Return on invested capital, percent. */
  roicPct: number | null;
  /** Beta vs S&P 500. */
  beta: number | null;
  /** Annualized volatility, percent. */
  volPct: number | null;
}

/** Snapshot POSTed to /api/optimize. */
export interface OptimizerRequest {
  objective: { id: ObjectiveId; label: string };
  constraints: { maxWeightPct: number; minWeightPct: number };
  before: {
    expectedReturnPct: number;
    volatilityPct: number;
    sharpe: number;
    diversification: number;
    effectiveN: number;
    topWeightPct: number;
    yieldPct: number;
    beta: number;
  };
  after: {
    expectedReturnPct: number;
    volatilityPct: number;
    sharpe: number;
    diversification: number;
    effectiveN: number;
    topWeightPct: number;
    yieldPct: number;
    beta: number;
  };
  turnoverPct: number;
  cashWeightPct: number;
  /** Largest weight moves, biggest first; the client caps this. */
  shifts: OptimizerShift[];
}

/** A single weight move the reasoning model is calling out. */
export interface ReasonedShift {
  symbol: string;
  action: ShiftAction;
  detail: string;
}

/** A structural tradeoff or risk the optimized book carries. */
export interface ReasonedNote {
  title: string;
  detail: string;
}

/** The structured institutional read returned by the model. */
export interface OptimizerPlan {
  /** Overall read on what the optimizer did and whether it's worth implementing. */
  thesis: string;
  /** How the objective reshaped the book — the mechanism, in plain terms. */
  assessment: string;
  /** The highest-signal weight moves, with the reasoning for each. */
  keyShifts: ReasonedShift[];
  /** What the investor gives up to get this — honest tradeoffs. */
  tradeoffs: ReasonedNote[];
  /** Residual risks the optimized book still carries. */
  risks: ReasonedNote[];
  /** A calibrated bottom line: implement, partially implement, or pass. */
  verdict: string;
  confidence: Confidence;
}

export interface OptimizerResponse {
  plan: OptimizerPlan;
  generatedAt: string;
  cached: boolean;
  /** Estimated USD cost of the review. Null when the model is unpriced. */
  costUSD?: number | null;
}
