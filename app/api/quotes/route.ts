import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes, sanitizeSymbols } from "@/lib/server/yahoo";

export const dynamic = "force-dynamic";

/**
 * GET /api/quotes?symbols=AAPL,MSFT
 * Thin cached proxy for live quotes. CDN caches for 60s per symbol set
 * (clients sort symbols so the cache key is stable).
 */
export async function GET(req: NextRequest) {
  const symbols = sanitizeSymbols(req.nextUrl.searchParams.get("symbols"));
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }
  try {
    const quotes = await fetchQuotes(symbols);
    return NextResponse.json(
      { quotes, asOf: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "quote provider unavailable" }, { status: 502 });
  }
}
