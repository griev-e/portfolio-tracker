/**
 * Shared contract between the server-side regime engine and the Market
 * Analysis page. Pure types — safe to import from client components.
 */

export type LayerId =
  | "trend"
  | "breadth"
  | "relstrength"
  | "leadership"
  | "volatility"
  | "structure"
  | "momentum"
  | "transition";

export type RegimeLabel =
  | "Strong Risk-On"
  | "Risk-On"
  | "Neutral"
  | "Risk-Off"
  | "Strong Risk-Off";

export type ConsensusLabel =
  | "Strong Consensus"
  | "Moderate Consensus"
  | "Mixed Signals"
  | "Highly Conflicted";

export type DirectionLabel = "Improving" | "Deteriorating" | "Stable";

/** One observable, scored -1 (risk-off / unhealthy) … +1 (risk-on / healthy). */
export interface SignalResult {
  id: string;
  label: string;
  score: number;
  /** Human explanation with the actual values behind the score. */
  detail: string;
}

export interface LayerResult {
  id: LayerId;
  name: string;
  /** The question this layer answers. */
  question: string;
  /** -1 … +1. Significance-weighted blend of the layer's signals. */
  score: number | null;
  /** 0…1 — how much the layer's signals agree with each other. */
  coherence: number | null;
  /** 0…1 — how steady the layer's score has been over the last month. */
  stability: number | null;
  /** 0…1 — fraction of the layer's signals that were computable. */
  coverage: number;
  /** 0…1 — dynamically derived share of the composite (sums to 1). */
  weight: number;
  /** Generated one-line answer to the layer's question. */
  summary: string;
  signals: SignalResult[];
  /** Layer score change vs ~one month ago, when history allows. */
  delta21: number | null;
}

export interface DriverItem {
  label: string;
  layer: string;
  detail: string;
  /** Signal score for tailwinds/headwinds; signed change for shifts. */
  value: number;
}

export interface TrendRow {
  symbol: string;
  label: string;
  ret21: number | null;
  ret63: number | null;
  above50: boolean | null;
  above200: boolean | null;
  /** Annualized 63-session log-price trend slope (OLS). */
  slope: number | null;
  /** Fraction of the last quarter spent above the 50-day average. */
  consistency: number | null;
  /** Distance from the 50-day average, as a fraction of price. */
  stretch: number | null;
}

export interface RatioRow {
  id: string;
  label: string;
  a: string;
  b: string;
  /** Percentile-scored trend of the ratio, -1…+1 (+ = risk appetite). */
  score: number | null;
  ret21: number | null;
  ret63: number | null;
  verdict: "risk-on" | "risk-off" | "neutral";
}

export interface RegimeReport {
  /** Last completed market session in the data. */
  asOf: string;
  generatedAt: string;
  coverage: { requested: number; loaded: number; missing: string[] };

  /** -1 … +1 composite risk-on/risk-off score. */
  score: number;
  regime: RegimeLabel;
  /** 0–100. */
  confidence: number;
  consensus: ConsensusLabel;
  /** 0…1 cross-layer agreement behind the consensus label. */
  agreement: number;
  /** 0…1 — how persistent the composite signal has been. */
  persistence: number;
  /** 0–100 internal market health. */
  health: number;
  /** Sessions the current regime bucket has been in place (capped). */
  maturityDays: number;
  maturityCapped: boolean;
  direction: DirectionLabel;
  /** Composite change projected over the last month's drift. */
  directionSlope: number;

  layers: LayerResult[];
  history: { dates: string[]; score: number[]; health: number[] };
  drivers: {
    bullish: DriverItem[];
    bearish: DriverItem[];
    shifts: DriverItem[];
    risks: string[];
    opportunities: string[];
  };
  trendTable: TrendRow[];
  ratios: RatioRow[];
  methodology: string[];
}
