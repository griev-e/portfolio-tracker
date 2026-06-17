import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/server/yahoo";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=apple
 * Ticker / company lookup for the Research terminal. Results move slowly, so
 * the CDN caches them for 6h. Failures return an empty list, never a 5xx — the
 * search box just shows "no matches".
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 40);
  if (q.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }
  const results = await searchSymbols(q);
  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    }
  );
}
