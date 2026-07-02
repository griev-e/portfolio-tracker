import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentalsPatch } from "@/lib/server/fundamentals";
import { sanitizeSymbols } from "@/lib/server/yahoo";
import type { FundamentalsPatch } from "@/lib/live/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Stop starting new provider fetches this long into the request, so a cold
 * 30-symbol book on a slow provider returns what it has instead of blowing the
 * 30s function budget and 500-ing the whole overlay. Symbols already fetched
 * are warm-cached (12h), so the client's next poll finishes the remainder.
 */
const DEADLINE_MS = 22_000;

/**
 * GET /api/fundamentals?symbols=AAPL,MSFT
 * Live fundamentals overlay, fetched per symbol with bounded concurrency.
 * Fundamentals move slowly — CDN caches for 12h, server memory for 12h.
 * Symbols Yahoo can't resolve are simply omitted; the client falls back to
 * the bundled snapshot. On a cold cache that grazes the function deadline the
 * response is partial (`partial: true`, not CDN-cached) rather than an error.
 */
export async function GET(req: NextRequest) {
  const symbols = sanitizeSymbols(req.nextUrl.searchParams.get("symbols"));
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }

  const started = Date.now();
  const patches: Record<string, FundamentalsPatch> = {};
  let partial = false;
  const CONCURRENCY = 6;
  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    if (Date.now() - started > DEADLINE_MS) {
      partial = true;
      break;
    }
    const chunk = symbols.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(fetchFundamentalsPatch));
    results.forEach((r, j) => {
      if (r.status === "fulfilled" && r.value) patches[chunk[j]] = r.value;
    });
  }

  return NextResponse.json(
    { patches, asOf: new Date().toISOString(), ...(partial ? { partial } : {}) },
    {
      headers: {
        // Never CDN-cache a partial overlay — the next poll should finish it.
        "Cache-Control": partial
          ? "no-store"
          : "public, s-maxage=43200, stale-while-revalidate=86400",
      },
    }
  );
}
