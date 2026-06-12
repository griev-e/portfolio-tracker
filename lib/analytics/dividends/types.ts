/**
 * Shared contract for the dividend engine. The server ships per-symbol
 * dividend profiles (history + safety inputs); the client engine joins them
 * with the portfolio (shares, cost basis, sectors) into the full report.
 * Pure types — safe to import anywhere.
 */

export interface DividendEvent {
  /** Ex-dividend date, ISO yyyy-mm-dd. */
  date: string;
  /** Per-share amount in USD. */
  amount: number;
}

export type PayFrequency =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "irregular"
  | "none";

/** Per-symbol dividend data served by /api/dividends. */
export interface DividendProfile {
  symbol: string;
  asOf: string;
  kind: "stock" | "fund";
  /** Provider's forward $/share/yr; null when not declared. */
  forwardRate: number | null;
  /** Earnings payout ratio, fraction (stocks only). */
  payoutRatio: number | null;
  /** Total dividends paid / free cash flow, fraction (stocks only). */
  fcfPayout: number | null;
  /** Per-share payments, oldest first, trailing ~10.5 years. */
  events: DividendEvent[];
}

export type SafetyTone = "safe" | "watch" | "risk";

/** One holding's dividend evaluation. */
export interface HoldingDividend {
  symbol: string;
  name: string;
  sector: string;
  kind: "stock" | "fund";
  /** Forward annual income in dollars (shares × rate). */
  income: number;
  /** Share of total portfolio income, 0…1. */
  incomeShare: number;
  /** True when income was estimated from a yield because history failed. */
  estimated: boolean;
  currentYield: number | null;
  yieldOnCost: number | null;
  frequency: PayFrequency;
  /** Calendar months (1-12) in which this holding paid over the last year. */
  payMonths: number[];
  growth1: number | null;
  cagr3: number | null;
  cagr5: number | null;
  /** Consecutive completed years of increases. */
  streak: number;
  /** Dividend reductions in the last decade. */
  cuts10y: number;
  /** Fraction of year-over-year changes that were ≥ 0 (last 10). */
  consistency: number | null;
  payoutRatio: number | null;
  fcfPayout: number | null;
  safety: number; // 0-100
  safetyTone: SafetyTone;
  quality: number | null; // 0-100, null without fundamentals
  flags: string[];
  /** Why the safety score landed where it did. */
  safetyNotes: string[];
}

export type DividendGrade = "Elite" | "Strong" | "Average" | "Weak" | "High Risk";

export interface MonthIncome {
  /** 1-12 calendar month. */
  month: number;
  income: number;
  payers: string[];
}

export interface ScenarioRow {
  id: "conservative" | "base" | "optimistic";
  label: string;
  growth: number;
  y1: number;
  y3: number;
  y5: number;
  /** Year-5 income with dividends reinvested at the current yield. */
  y5Drip: number;
}

export interface DividendReport {
  asOf: string;

  /* Income layer */
  annualIncome: number;
  ttmIncome: number;
  monthlyAvg: number;
  portfolioYield: number; // income / total value (incl. cash)
  equityYield: number; // income / invested equity
  yieldOnCost: number;
  payerCount: number;
  positionCount: number;
  estimatedCount: number;

  /* Scores (0-100) */
  composite: number;
  grade: DividendGrade;
  safety: number;
  growth: number;
  stability: number;
  diversification: number;

  /* Growth layer */
  portfolioGrowth1: number | null;
  portfolioCagr3: number | null;
  portfolioCagr5: number | null;
  accelerating: boolean | null;

  /* Concentration layer */
  topPayerShare: number;
  top3Share: number;
  effectivePayers: number;
  sectorIncome: { sector: string; income: number; share: number }[];
  effectiveSectors: number;

  /* Calendar layer */
  calendar: MonthIncome[];
  evenness: number | null; // coefficient of variation of monthly income
  gapMonths: number[];

  /* Forecast */
  scenarios: ScenarioRow[];
  dripBoost5y: number; // extra year-5 income from reinvesting, dollars

  /* Risk layer */
  riskFlags: { symbol: string; flag: string }[];

  /* Benchmark */
  benchmarks: { label: string; yield: number }[];

  holdings: HoldingDividend[];
  methodology: string[];
}
