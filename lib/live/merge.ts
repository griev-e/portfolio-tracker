import type {
  DataCoverage,
  FieldSource,
  Fundamentals,
  FundamentalsProvenance,
} from "@/lib/types";
import type { FundamentalsPatch } from "./types";

/**
 * Field-by-field overlay of live data onto the bundled snapshot. Live wins
 * where the provider returned a value; the snapshot fills the gaps. Unknown
 * tickers with live data get promoted to full (neutral-defaulted)
 * fundamentals so research/quality/factors light up for them too.
 *
 * Every merge also records {@link FundamentalsProvenance}: which fields came
 * from the live patch vs the snapshot/default, plus a coverage roll-up over the
 * risk-critical fields. This lets the UI mark stale values explicitly instead
 * of silently presenting a frozen snapshot as if it were live.
 */

/** Fundamentals fields whose source we track for provenance. */
const TRACKED: (keyof Fundamentals)[] = [
  "name",
  "sector",
  "industry",
  "regions",
  "marketCap",
  "beta",
  "volatility",
  "revenueGrowth",
  "epsGrowth",
  "fcfGrowth",
  "forwardPE",
  "fcfYield",
  "operatingMargin",
  "grossMargin",
  "roic",
  "debtToEquity",
  "dividendYield",
  "return12m",
  "analyst",
  "insider",
  "earningsDate",
  "fund",
];

/** Fields that drive the risk/correlation math — the roll-up keys off these. */
const CRITICAL: (keyof Fundamentals)[] = ["beta", "volatility", "sector"];

/** Did the live patch actually supply a value for this fundamentals field? */
function patchHas(patch: FundamentalsPatch, field: keyof Fundamentals): boolean {
  // The one field whose patch key differs from the fundamentals key.
  if (field === "fund") return patch.fundSectorWeights !== undefined;
  return (patch as unknown as Record<string, unknown>)[field] !== undefined;
}

/** Build the provenance record for a merge given the (optional) live patch. */
function buildProvenance(
  patch: FundamentalsPatch | undefined
): FundamentalsProvenance {
  const fields: Partial<Record<keyof Fundamentals, FieldSource>> = {};
  for (const f of TRACKED) {
    fields[f] = patch && patchHas(patch, f) ? "live" : "fallback";
  }
  const liveCount = CRITICAL.filter((f) => fields[f] === "live").length;
  const coverage: DataCoverage =
    liveCount === CRITICAL.length
      ? "live"
      : liveCount > 0
        ? "partial"
        : "fallback";
  return { fields, coverage };
}

export function mergeFundamentals(
  bundled: Fundamentals | null,
  patch: FundamentalsPatch | undefined
): Fundamentals | null {
  if (!patch) {
    // Pure snapshot (or nothing). Tag it as fallback so the UI never mistakes
    // the frozen snapshot for live data.
    return bundled
      ? { ...bundled, provenance: buildProvenance(undefined) }
      : null;
  }
  if (!bundled) return fromPatch(patch);

  return {
    ...bundled,
    name: patch.name ?? bundled.name,
    sector: patch.sector ?? bundled.sector,
    industry: patch.industry ?? bundled.industry,
    regions: patch.regions ?? bundled.regions,
    marketCap: patch.marketCap ?? bundled.marketCap,
    beta: patch.beta ?? bundled.beta,
    volatility: patch.volatility ?? bundled.volatility,
    revenueGrowth: patch.revenueGrowth ?? bundled.revenueGrowth,
    epsGrowth: patch.epsGrowth ?? bundled.epsGrowth,
    fcfGrowth: patch.fcfGrowth ?? bundled.fcfGrowth,
    forwardPE: patch.forwardPE ?? bundled.forwardPE,
    fcfYield: patch.fcfYield ?? bundled.fcfYield,
    operatingMargin: patch.operatingMargin ?? bundled.operatingMargin,
    grossMargin: patch.grossMargin ?? bundled.grossMargin,
    roic: patch.roic ?? bundled.roic,
    debtToEquity: patch.debtToEquity ?? bundled.debtToEquity,
    dividendYield: patch.dividendYield ?? bundled.dividendYield,
    return12m: patch.return12m ?? bundled.return12m,
    analyst: {
      rating: patch.analyst?.rating ?? bundled.analyst.rating,
      priceTarget: patch.analyst?.priceTarget ?? bundled.analyst.priceTarget,
      targetLow: patch.analyst?.targetLow ?? bundled.analyst.targetLow,
      targetHigh: patch.analyst?.targetHigh ?? bundled.analyst.targetHigh,
      count: patch.analyst?.count ?? bundled.analyst.count,
    },
    insider: patch.insider
      ? {
          signal: patch.insider.signal ?? bundled.insider.signal,
          netActivity6m:
            patch.insider.netActivity6m ?? bundled.insider.netActivity6m,
          buys6m: patch.insider.buys6m ?? bundled.insider.buys6m,
          sells6m: patch.insider.sells6m ?? bundled.insider.sells6m,
        }
      : bundled.insider,
    earningsDate: patch.earningsDate ?? bundled.earningsDate,
    fund: patch.fundSectorWeights
      ? { sectorWeights: patch.fundSectorWeights }
      : bundled.fund,
    live: true,
    provenance: buildProvenance(patch),
  };
}

/** Neutral default beta for a name the provider gives us no beta for. */
export const DEFAULT_BETA = 1.0;

/** Approximate annualized volatility from beta, when realized vol is unavailable. */
export function estimatedVolatility(beta: number): number {
  return Math.min(0.85, Math.max(0.18, 0.12 + 0.16 * beta));
}

/**
 * Build full fundamentals for a ticker the bundle doesn't know. Exported so
 * callers that only have a quote (no fundamentals patch at all, e.g. the
 * Research page on a provider-coverage gap) can still synthesize a
 * fully-estimated profile for display — every field traces through
 * {@link buildProvenance} as "fallback", so the UI never confuses it with live
 * data.
 */
export function fromPatch(patch: FundamentalsPatch): Fundamentals {
  const beta = patch.beta ?? DEFAULT_BETA;
  return {
    symbol: patch.symbol,
    name: patch.name ?? patch.symbol,
    sector: patch.sector ?? "Unknown",
    industry: patch.industry ?? "Unknown",
    // No keyless source for revenue-by-region, so leave it empty rather than
    // fabricate a 100%-US default. Region exposure shows as a coverage gap.
    regions: patch.regions ?? {},
    marketCap: patch.marketCap ?? 0,
    beta,
    // Realized vol from price history when available; else approximate from beta.
    volatility: patch.volatility ?? estimatedVolatility(beta),
    revenueGrowth: patch.revenueGrowth ?? 0.05,
    epsGrowth: patch.epsGrowth ?? 0.08,
    fcfGrowth: patch.fcfGrowth ?? patch.revenueGrowth ?? 0.05,
    forwardPE: patch.forwardPE ?? null,
    fcfYield: patch.fcfYield ?? 0.03,
    roic: patch.roic ?? 0.12,
    // No neutral default for leverage — a fabricated D/E would grade balance
    // sheets we know nothing about. Null scores neutral downstream.
    debtToEquity: patch.debtToEquity ?? null,
    operatingMargin: patch.operatingMargin ?? 0.14,
    grossMargin: patch.grossMargin ?? 0.4,
    dividendYield: patch.dividendYield ?? 0,
    return12m: patch.return12m ?? 0.08,
    analyst: {
      rating: patch.analyst?.rating ?? "Hold",
      priceTarget: patch.analyst?.priceTarget ?? 0,
      targetLow: patch.analyst?.targetLow ?? 0,
      targetHigh: patch.analyst?.targetHigh ?? 0,
      count: patch.analyst?.count ?? 0,
    },
    insider: {
      signal: patch.insider?.signal ?? "Neutral",
      netActivity6m: patch.insider?.netActivity6m ?? 0,
      buys6m: patch.insider?.buys6m ?? 0,
      sells6m: patch.insider?.sells6m ?? 0,
    },
    earningsDate: patch.earningsDate ?? null,
    ...(patch.fundSectorWeights
      ? { fund: { sectorWeights: patch.fundSectorWeights } }
      : {}),
    live: true,
    provenance: buildProvenance(patch),
  };
}
