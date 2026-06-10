import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentalsPatch, sanitizeSymbols } from "@/lib/server/yahoo";
import type { FundamentalsPatch } from "@/lib/live/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/fundamentals?symbols=AAPL,MSFT
 * Live fundamentals overlay, fetched per symbol with bounded concurrency.
 * Fundamentals move slowly — CDN caches for 12h, server memory for 12h.
 * Symbols Yahoo can't resolve are simply omitted; the client falls back to
 * the bundled snapshot.
 */
export async function GET(req: NextRequest) {
  const symbols = sanitizeSymbols(req.nextUrl.searchParams.get("symbols"));
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }

  const patches: Record<string, FundamentalsPatch> = {};
  const CONCURRENCY = 4;
  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const chunk = symbols.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(fetchFundamentalsPatch));
    results.forEach((r, j) => {
      if (r.status === "fulfilled" && r.value) patches[chunk[j]] = r.value;
    });
  }

  return NextResponse.json(
    { patches, asOf: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400",
      },
    }
  );
}
