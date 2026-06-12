import { NextRequest, NextResponse } from "next/server";
import { fetchNews } from "@/lib/server/news";
import { sanitizeSymbols } from "@/lib/server/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/news?symbols=AAPL,NVDA
 * Recent headlines for the given holdings, deduped across symbols and
 * sorted newest-first. Cached ~10 min server-side and at the CDN.
 */
export async function GET(req: NextRequest) {
  const symbols = sanitizeSymbols(req.nextUrl.searchParams.get("symbols"));
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }
  try {
    const items = await fetchNews(symbols);
    return NextResponse.json(
      { items, asOf: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "news provider unavailable" },
      { status: 502 }
    );
  }
}
