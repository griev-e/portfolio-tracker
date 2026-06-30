import type { FundamentalsPatch } from "@/lib/live/types";
import { fetchFinnhubPatch } from "./finnhub";
import { fetchFmpPatch } from "./fmp";
import { fetchYahooPatch } from "./yahoo";

/**
 * Fundamentals orchestrator. Three providers, layered by precedence:
 *
 *   1. **Yahoo** (keyless, primary) — the fast-moving, broadly-covered fields.
 *   2. **Finnhub** (optional, `FINNHUB_API_KEY`) — **gap-fill only**: fills the
 *      fields Yahoo left empty (common for newly-listed tickers with no
 *      statement history — margins, ROIC, growth, beta). Never overrides Yahoo.
 *   3. **FMP** (optional, `FMP_API_KEY`) — authoritative for ROIC, FCF growth
 *      and region mix, which it sources more cleanly than the others.
 *
 * Any provider may be null (unknown symbol, outage, no key); the result is null
 * only when all come back empty, which the caller treats as "no live data" and
 * degrades accordingly.
 */
export async function fetchFundamentalsPatch(
  symbol: string
): Promise<FundamentalsPatch | null> {
  const [yahoo, finnhub, fmp] = await Promise.all([
    fetchYahooPatch(symbol),
    fetchFinnhubPatch(symbol),
    fetchFmpPatch(symbol),
  ]);

  if (!yahoo && !finnhub && !fmp) return null;

  // Base identity: Yahoo if present, else a Finnhub-seeded stub.
  const base: FundamentalsPatch =
    yahoo ?? { symbol, asOf: new Date().toISOString() };

  // Layer Finnhub under Yahoo: Yahoo's value wins; Finnhub fills only the gaps.
  let merged: FundamentalsPatch = base;
  if (finnhub) {
    const next = { ...base } as Record<string, unknown>;
    for (const [k, v] of Object.entries(finnhub)) {
      if (v !== undefined && next[k] === undefined) next[k] = v;
    }
    merged = next as unknown as FundamentalsPatch;
  }

  if (!fmp) return merged;

  return {
    ...merged,
    // FMP is authoritative for these three; fall back to the merged value otherwise.
    roic: fmp.roic ?? merged.roic,
    fcfGrowth: fmp.fcfGrowth ?? merged.fcfGrowth,
    regions: fmp.regions ?? merged.regions,
  };
}
