import { NextRequest, NextResponse } from "next/server";
import { aiRequestAllowed } from "@/lib/server/aiEndpoint";
import { searchSymbols } from "@/lib/server/yahoo";
import type { SearchResponse } from "@/lib/research/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=apple
 * Ticker / company lookup for the Research terminal. Results move slowly, so
 * the CDN caches them for 6h. Failures return an empty list, never a 5xx — the
 * search box just shows "no matches".
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 40);
  // Empty query, or a client exceeding the per-IP budget → empty list (never a
  // 5xx): the autocomplete just shows "no matches" and the provider is spared.
  if (q.trim().length === 0 || !aiRequestAllowed(req, "search", 40)) {
    return NextResponse.json<SearchResponse>({ results: [] });
  }
  const results = await searchSymbols(q);
  return NextResponse.json<SearchResponse>(
    { results },
    {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    }
  );
}
