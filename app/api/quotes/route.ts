import { NextRequest, NextResponse } from "next/server";
import { requestAllowed } from "@/lib/server/aiEndpoint";
import { fetchQuotes, sanitizeSymbols } from "@/lib/server/yahoo";

export const dynamic = "force-dynamic";

/**
 * GET /api/quotes?symbols=AAPL,MSFT[&fresh=1]
 * Thin cached proxy for live quotes. CDN caches for 60s per symbol set
 * (clients sort symbols so the cache key is stable). `fresh=1` is the
 * manual-refresh path: it bypasses both the server quote cache and the CDN.
 */
export async function GET(req: NextRequest) {
  const symbols = sanitizeSymbols(req.nextUrl.searchParams.get("symbols"));
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  // The normal poll path is CDN + warm-cache absorbed; `fresh=1` punches
  // through every cache straight to the provider, so rate-limit that path —
  // otherwise one client hammering manual refresh burns the shared Yahoo
  // budget for everyone. 10/min is far above any human refresh cadence.
  if (fresh && !requestAllowed(req, "quotes-fresh", 10)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  try {
    const quotes = await fetchQuotes(symbols, fresh);
    return NextResponse.json(
      { quotes, asOf: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": fresh
            ? "no-store"
            : "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch {
    // Defensive backstop only: fetchQuotes degrades internally (partial-failure
    // safe, returns whatever the warm cache holds), so it resolves even when the
    // provider is down. This fires only on an unexpected throw.
    return NextResponse.json({ error: "quote provider unavailable" }, { status: 502 });
  }
}
