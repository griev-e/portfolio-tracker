/**
 * The observable universe the regime engine reads. Metadata only — safe on
 * the client. Every layer derives its inputs from these series, so extending
 * the engine usually starts by adding a symbol here.
 */

export interface IndexMeta {
  symbol: string;
  label: string;
}

export type SectorPosture = "offensive" | "cyclical" | "defensive";

export interface SectorMeta {
  symbol: string;
  label: string;
  posture: SectorPosture;
}

export interface PairMeta {
  id: string;
  label: string;
  /** Numerator — the risk-seeking leg. */
  a: string;
  /** Denominator — the safety-seeking leg. */
  b: string;
  lens: string;
}

export const INDICES: IndexMeta[] = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "NASDAQ 100" },
  { symbol: "IWM", label: "Russell 2000" },
  { symbol: "RSP", label: "S&P 500 EW" },
];

/** Posture: how historically risk-on a sector's leadership reads. */
export const POSTURE_SCORE: Record<SectorPosture, number> = {
  offensive: 1,
  cyclical: 0.4,
  defensive: -1,
};

export const SECTORS: SectorMeta[] = [
  { symbol: "XLK", label: "Technology", posture: "offensive" },
  { symbol: "XLY", label: "Discretionary", posture: "offensive" },
  { symbol: "XLC", label: "Communication", posture: "offensive" },
  { symbol: "XLF", label: "Financials", posture: "cyclical" },
  { symbol: "XLI", label: "Industrials", posture: "cyclical" },
  { symbol: "XLB", label: "Materials", posture: "cyclical" },
  { symbol: "XLE", label: "Energy", posture: "cyclical" },
  { symbol: "XLV", label: "Health Care", posture: "defensive" },
  { symbol: "XLP", label: "Staples", posture: "defensive" },
  { symbol: "XLU", label: "Utilities", posture: "defensive" },
  { symbol: "XLRE", label: "Real Estate", posture: "defensive" },
];

/** Cross-asset ratios: where is capital flowing? (a/b rising = risk-on) */
export const PAIRS: PairMeta[] = [
  { id: "disc-staples", label: "Discretionary / Staples", a: "XLY", b: "XLP", lens: "consumer risk appetite" },
  { id: "growth-value", label: "Growth / Value", a: "IWF", b: "IWD", lens: "style preference" },
  { id: "small-large", label: "Small / Large Cap", a: "IWM", b: "SPY", lens: "risk-curve positioning" },
  { id: "tech-utes", label: "Tech / Utilities", a: "XLK", b: "XLU", lens: "offense vs defense" },
  { id: "credit", label: "High Yield / Inv. Grade", a: "HYG", b: "LQD", lens: "credit risk appetite" },
  { id: "stocks-gold", label: "Stocks / Gold", a: "SPY", b: "GLD", lens: "equities vs safety" },
  { id: "stocks-bonds", label: "Stocks / Treasuries", a: "SPY", b: "TLT", lens: "asset-class preference" },
];

export const VOL_SYMBOLS = { vix: "^VIX", vix3m: "^VIX3M" };

/** Every series the engine fetches. */
export const ALL_SYMBOLS: string[] = [
  ...new Set([
    ...INDICES.map((i) => i.symbol),
    ...SECTORS.map((s) => s.symbol),
    ...PAIRS.flatMap((p) => [p.a, p.b]),
    VOL_SYMBOLS.vix,
    VOL_SYMBOLS.vix3m,
  ]),
];
