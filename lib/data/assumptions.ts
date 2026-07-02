import type { BenchmarkProfile, FactorScores } from "../types";
import { factorScores } from "../analytics/factors";

/**
 * Market assumptions that have **no live market quote** and therefore cannot be
 * fetched — they are forward assumptions, not observable facts. Rather than
 * hide them as frozen constants (which the rest of the app has now eliminated),
 * they are surfaced as explicit, user-editable inputs with sensible defaults.
 *
 * Three things live here:
 *   1. The equity risk premium (the forward premium of equities over the
 *      risk-free rate — no instrument quotes it).
 *   2. The S&P 500 long-run dividend-growth anchor used by the dividend engine.
 *   3. The per-benchmark profitability & growth aggregates (operating/gross
 *      margin, ROIC, revenue/EPS/FCF growth) for the S&P 500 and NASDAQ-100.
 *      Index-level financials aren't published by any keyless feed, and a true
 *      look-through over 500 constituents is infeasible — so these stay
 *      assumptions. (The benchmark's *valuation* fields — P/E, dividend yield,
 *      FCF yield, sector weights, volatility — are fetched live; see
 *      `lib/live/cma.ts`.)
 *
 * Everything else in the app is live. These few values are the irreducible
 * remainder, made transparent and tunable instead of pretending to be data.
 */

/** The non-live profitability & growth aggregates for one benchmark index. */
export interface BenchmarkFundamentalAssumptions {
  revenueGrowth: number;
  epsGrowth: number;
  fcfGrowth: number;
  roic: number;
  operatingMargin: number;
  grossMargin: number;
}

export interface MarketAssumptions {
  /** Equity risk premium for CAPM expected returns (rf + β·ERP). */
  equityRiskPremium: number;
  /** S&P 500 long-run dividend-growth anchor for the dividend engine. */
  dividendGrowth: number;
  spx: BenchmarkFundamentalAssumptions;
  ndx: BenchmarkFundamentalAssumptions;
}

/**
 * Named presets the user can snap to. The labels are reference-anchored so
 * their meaning is self-evident — "10-year average" / "Recession" can't be
 * misread the way "Conservative / Aggressive" can. `Custom` is implicit: it's
 * selected automatically whenever the live values no longer match any preset.
 */
export type PresetId = "today" | "average" | "recession";

export interface AssumptionPreset {
  id: PresetId;
  label: string;
  detail: string;
  values: MarketAssumptions;
}

/**
 * "10-year average" — the long-run normal. These are the figures the app
 * shipped with as frozen constants; they are now the neutral default.
 */
const AVERAGE: MarketAssumptions = {
  equityRiskPremium: 0.045,
  dividendGrowth: 0.06,
  spx: {
    revenueGrowth: 0.055,
    epsGrowth: 0.1,
    fcfGrowth: 0.08,
    roic: 0.14,
    operatingMargin: 0.16,
    grossMargin: 0.45,
  },
  ndx: {
    revenueGrowth: 0.09,
    epsGrowth: 0.14,
    fcfGrowth: 0.11,
    roic: 0.2,
    operatingMargin: 0.24,
    grossMargin: 0.55,
  },
};

/** "Market today" — current late-cycle conditions: richer margins, fuller growth, a thinner risk premium. */
const TODAY: MarketAssumptions = {
  equityRiskPremium: 0.04,
  dividendGrowth: 0.065,
  spx: {
    revenueGrowth: 0.06,
    epsGrowth: 0.12,
    fcfGrowth: 0.1,
    roic: 0.16,
    operatingMargin: 0.18,
    grossMargin: 0.47,
  },
  ndx: {
    revenueGrowth: 0.11,
    epsGrowth: 0.18,
    fcfGrowth: 0.14,
    roic: 0.23,
    operatingMargin: 0.27,
    grossMargin: 0.57,
  },
};

/** "Recession" — a stressed backdrop: contracting growth, compressed margins, a fatter risk premium. */
const RECESSION: MarketAssumptions = {
  equityRiskPremium: 0.065,
  dividendGrowth: 0.02,
  spx: {
    revenueGrowth: 0.0,
    epsGrowth: -0.1,
    fcfGrowth: -0.08,
    roic: 0.1,
    operatingMargin: 0.12,
    grossMargin: 0.42,
  },
  ndx: {
    revenueGrowth: 0.03,
    epsGrowth: -0.05,
    fcfGrowth: -0.03,
    roic: 0.15,
    operatingMargin: 0.19,
    grossMargin: 0.52,
  },
};

export const ASSUMPTION_PRESETS: AssumptionPreset[] = [
  {
    id: "today",
    label: "Market today",
    detail: "Current late-cycle conditions — fuller margins and growth, a thinner risk premium.",
    values: TODAY,
  },
  {
    id: "average",
    label: "10-year average",
    detail: "The long-run normal. A neutral, mid-cycle benchmark.",
    values: AVERAGE,
  },
  {
    id: "recession",
    label: "Recession",
    detail: "A stressed backdrop — contracting earnings, compressed margins, a fatter risk premium.",
    values: RECESSION,
  },
];

/** Neutral default the app boots with when the user hasn't chosen otherwise. */
export const DEFAULT_ASSUMPTIONS: MarketAssumptions = AVERAGE;
export const DEFAULT_PRESET: PresetId = "average";

/** Deep clone so callers can't mutate a shared preset object. */
export function cloneAssumptions(a: MarketAssumptions): MarketAssumptions {
  return {
    equityRiskPremium: a.equityRiskPremium,
    dividendGrowth: a.dividendGrowth,
    spx: { ...a.spx },
    ndx: { ...a.ndx },
  };
}

/** Which preset (if any) a set of assumptions exactly matches; null ⇒ Custom. */
export function matchPreset(a: MarketAssumptions): PresetId | null {
  // Field-wise compare — JSON.stringify equality is key-order dependent and
  // silently reports "Custom" for a semantically identical object.
  const fundEq = (
    x: BenchmarkFundamentalAssumptions,
    y: BenchmarkFundamentalAssumptions
  ) =>
    x.revenueGrowth === y.revenueGrowth &&
    x.epsGrowth === y.epsGrowth &&
    x.fcfGrowth === y.fcfGrowth &&
    x.roic === y.roic &&
    x.operatingMargin === y.operatingMargin &&
    x.grossMargin === y.grossMargin;
  for (const p of ASSUMPTION_PRESETS) {
    const v = p.values;
    if (
      v.equityRiskPremium === a.equityRiskPremium &&
      v.dividendGrowth === a.dividendGrowth &&
      fundEq(v.spx, a.spx) &&
      fundEq(v.ndx, a.ndx)
    ) {
      return p.id;
    }
  }
  return null;
}

// ─────────────────────────── Editable-bar metadata ───────────────────────────

/** A field's bar config: where it lives, its clamp range, and reference ticks. */
export interface BarSpec {
  label: string;
  /** Format hint for the value readout. */
  format: "pct" | "pct1";
  min: number;
  max: number;
  step: number;
  /** Suggested reference markers shown as ticks under the bar. */
  ticks: { at: number; label: string }[];
}

/** Bars for the two top-level scalar assumptions. */
export const SCALAR_BARS: Record<"equityRiskPremium" | "dividendGrowth", BarSpec> = {
  equityRiskPremium: {
    label: "Equity risk premium",
    format: "pct1",
    min: 0.01,
    max: 0.1,
    step: 0.0025,
    ticks: [
      { at: 0.04, label: "Today" },
      { at: 0.045, label: "10-yr" },
      { at: 0.065, label: "Recession" },
    ],
  },
  dividendGrowth: {
    label: "S&P dividend growth",
    format: "pct1",
    min: -0.05,
    max: 0.12,
    step: 0.005,
    ticks: [
      { at: 0.02, label: "Recession" },
      { at: 0.06, label: "10-yr" },
    ],
  },
};

/** Bars for each per-benchmark fundamental field, keyed by field. */
export const FUNDAMENTAL_BARS: Record<
  keyof BenchmarkFundamentalAssumptions,
  Omit<BarSpec, "ticks"> & { tickFrom: PresetId[] }
> = {
  revenueGrowth: { label: "Revenue growth", format: "pct", min: -0.1, max: 0.25, step: 0.005, tickFrom: ["recession", "average", "today"] },
  epsGrowth: { label: "EPS growth", format: "pct", min: -0.2, max: 0.3, step: 0.005, tickFrom: ["recession", "average", "today"] },
  fcfGrowth: { label: "FCF growth", format: "pct", min: -0.2, max: 0.3, step: 0.005, tickFrom: ["recession", "average", "today"] },
  roic: { label: "ROIC", format: "pct", min: 0.02, max: 0.4, step: 0.005, tickFrom: ["recession", "average", "today"] },
  operatingMargin: { label: "Operating margin", format: "pct", min: 0.02, max: 0.5, step: 0.005, tickFrom: ["recession", "average", "today"] },
  grossMargin: { label: "Gross margin", format: "pct", min: 0.1, max: 0.8, step: 0.005, tickFrom: ["recession", "average", "today"] },
};

/** Build the reference ticks for a per-benchmark field from the presets. */
export function fundamentalTicks(
  index: "spx" | "ndx",
  field: keyof BenchmarkFundamentalAssumptions
): { at: number; label: string }[] {
  const labelFor: Record<PresetId, string> = {
    today: "Today",
    average: "10-yr",
    recession: "Recession",
  };
  return FUNDAMENTAL_BARS[field].tickFrom.map((pid) => {
    const preset = ASSUMPTION_PRESETS.find((p) => p.id === pid)!;
    return { at: preset.values[index][field], label: labelFor[pid] };
  });
}

// ─────────────────────── Resolving a benchmark profile ───────────────────────

/** The benchmark fields fetched live (see lib/live/cma.ts); all optional. */
export interface LiveBenchmarkFields {
  forwardPE?: number;
  dividendYield?: number;
  fcfYield?: number;
  volatility?: number;
  return12m?: number;
  sectorWeights?: Partial<BenchmarkProfile["sectorWeights"]>;
}

/**
 * Assemble a full {@link BenchmarkProfile} from three layers:
 *   • `base`        — static identity + last-known fallbacks (id/name/ticker/beta).
 *   • `assumptions` — the user-owned profitability & growth aggregates.
 *   • `live`        — valuation/sector fields fetched from SPY/QQQ, when present.
 * `factorScores` is recomputed from the resolved fundamentals so the style
 * radar reflects the same inputs.
 */
export function resolveBenchmark(
  base: BenchmarkProfile,
  assumptions: MarketAssumptions,
  live?: LiveBenchmarkFields
): BenchmarkProfile {
  const fa = base.id === "ndx" ? assumptions.ndx : assumptions.spx;
  const merged: BenchmarkProfile = {
    ...base,
    revenueGrowth: fa.revenueGrowth,
    epsGrowth: fa.epsGrowth,
    fcfGrowth: fa.fcfGrowth,
    roic: fa.roic,
    operatingMargin: fa.operatingMargin,
    grossMargin: fa.grossMargin,
    forwardPE: live?.forwardPE ?? base.forwardPE,
    dividendYield: live?.dividendYield ?? base.dividendYield,
    fcfYield: live?.fcfYield ?? base.fcfYield,
    volatility: live?.volatility ?? base.volatility,
    return12m: live?.return12m ?? base.return12m,
    sectorWeights:
      live?.sectorWeights && Object.keys(live.sectorWeights).length > 0
        ? live.sectorWeights
        : base.sectorWeights,
    factorScores: base.factorScores, // replaced below
  };
  const fs: FactorScores = factorScores({
    revenueGrowth: merged.revenueGrowth,
    epsGrowth: merged.epsGrowth,
    fcfGrowth: merged.fcfGrowth,
    forwardPE: merged.forwardPE,
    fcfYield: merged.fcfYield,
    dividendYield: merged.dividendYield,
    roic: merged.roic,
    operatingMargin: merged.operatingMargin,
    grossMargin: merged.grossMargin,
    return12m: merged.return12m,
  } as Parameters<typeof factorScores>[0]);
  merged.factorScores = fs;
  return merged;
}
