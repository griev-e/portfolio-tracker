import type { FundamentalsPatch } from "@/lib/live/types";
import type { Sector } from "@/lib/types";

/**
 * Optional Finnhub enrichment (server-only) — a second live provider that fills
 * the gaps Yahoo leaves, which is most common for newly-listed tickers with no
 * statement history yet (margins, ROIC, growth, beta). It is **gap-fill only**:
 * the orchestrator keeps Yahoo's value wherever Yahoo has one and only reaches
 * for Finnhub where Yahoo came back empty.
 *
 * Gated on `FINNHUB_API_KEY`; with no key the module is a no-op and the app runs
 * on Yahoo (+ optional FMP) exactly as before. Two endpoints per symbol
 * (profile + all-metrics), 12h-cached, to stay well inside the free tier's
 * 60-requests/minute budget.
 */

const BASE = "https://finnhub.io/api/v1";

export const finnhubEnabled = (): boolean => !!process.env.FINNHUB_API_KEY;

const cache = new Map<string, { at: number; data: Partial<FundamentalsPatch> | null }>();
const TTL = 12 * 3600_000;

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Finnhub margin/growth/yield metrics arrive as percentages (43.9 → 0.439). */
const pct = (v: unknown): number | undefined => {
  const n = num(v);
  return n === undefined ? undefined : n / 100;
};

async function getJson(path: string): Promise<Record<string, unknown> | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: ctrl.signal,
      headers: { "X-Finnhub-Token": key },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Map Finnhub's free-text industry to one of our sector buckets. */
export function sectorFromIndustry(industry: string | undefined): Sector | undefined {
  if (!industry) return undefined;
  const s = industry.toLowerCase();
  if (/(semiconduct|software|technology|hardware|electronic|it services)/.test(s)) return "Technology";
  if (/(media|telecom|communication|entertainment|internet)/.test(s)) return "Communication Services";
  if (/(retail|apparel|auto|leisure|hotel|restaurant|consumer discretionary|e-commerce|homebuild)/.test(s)) return "Consumer Discretionary";
  if (/(food|beverage|tobacco|household|consumer staples|grocery|personal products)/.test(s)) return "Consumer Staples";
  if (/(bank|insurance|financial|capital markets|asset manage|payment)/.test(s)) return "Financials";
  if (/(pharma|biotech|health|medical|life sciences|drug)/.test(s)) return "Health Care";
  if (/(aerospace|defense|industrial|machinery|airlines|logistics|construction|transport)/.test(s)) return "Industrials";
  if (/(oil|gas|energy|coal|petroleum)/.test(s)) return "Energy";
  if (/(chemical|metals|mining|materials|paper|steel)/.test(s)) return "Materials";
  if (/(utilit|electric|water|power)/.test(s)) return "Utilities";
  if (/(real estate|reit)/.test(s)) return "Real Estate";
  return undefined;
}

/**
 * The subset Finnhub contributes. Pulled from `/stock/profile2` (identity,
 * market cap, sector) and `/stock/metric?metric=all` (beta, margins, ROIC,
 * growth, P/E, dividend yield, 12m return).
 */
export async function fetchFinnhubPatch(
  symbol: string
): Promise<Partial<FundamentalsPatch> | null> {
  if (!finnhubEnabled()) return null;
  const now = Date.now();
  const hit = cache.get(symbol);
  if (hit && now - hit.at < TTL) return hit.data;

  const [profile, metrics] = await Promise.all([
    getJson(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`),
    getJson(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`),
  ]);

  const m = (metrics?.metric ?? {}) as Record<string, unknown>;

  const marketCapM = num(profile?.marketCapitalization); // in millions USD
  const patch: Partial<FundamentalsPatch> = {
    name: typeof profile?.name === "string" ? profile.name : undefined,
    sector: sectorFromIndustry(
      typeof profile?.finnhubIndustry === "string" ? profile.finnhubIndustry : undefined
    ),
    industry:
      typeof profile?.finnhubIndustry === "string" ? profile.finnhubIndustry : undefined,
    marketCap: marketCapM !== undefined ? marketCapM * 1e6 : undefined,
    beta: num(m.beta),
    forwardPE: num(m.peTTM) ?? num(m.peNormalizedAnnual),
    grossMargin: pct(m.grossMarginTTM) ?? pct(m.grossMarginAnnual),
    operatingMargin: pct(m.operatingMarginTTM) ?? pct(m.operatingMarginAnnual),
    roic: pct(m.roiTTM) ?? pct(m.roiAnnual),
    dividendYield:
      pct(m.currentDividendYieldTTM) ?? pct(m.dividendYieldIndicatedAnnual),
    revenueGrowth: pct(m.revenueGrowthTTMYoy) ?? pct(m.revenueGrowthQuarterlyYoy),
    epsGrowth: pct(m.epsGrowthTTMYoy) ?? pct(m.epsGrowthQuarterlyYoy),
    return12m: pct(m["52WeekPriceReturnDaily"]),
  };

  // Drop undefined keys so the orchestrator's `??` gap-fill sees real values only.
  for (const k of Object.keys(patch) as (keyof FundamentalsPatch)[]) {
    if (patch[k] === undefined) delete patch[k];
  }

  const result = Object.keys(patch).length > 0 ? patch : null;
  cache.set(symbol, { at: now, data: result });
  return result;
}
