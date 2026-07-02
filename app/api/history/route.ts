import { NextRequest, NextResponse } from "next/server";
import { requestAllowed } from "@/lib/server/aiEndpoint";
import { fetchHistory, sanitizeSymbols } from "@/lib/server/yahoo";
import type { HistoryRange } from "@/lib/research/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RANGES: readonly HistoryRange[] = ["1m", "6m", "1y", "5y"];

/**
 * GET /api/history?symbol=AAPL&range=1y
 * Adjusted-close price history for one symbol. Daily bars move once a day, so
 * the CDN caches for 10min. 404 when the provider has no series for the symbol.
 */
export async function GET(req: NextRequest) {
  // Per-symbol cache misses are attacker-forcible (churn random symbols), and
  // each miss is a real provider hit — cap per-IP churn like search does. The
  // legitimate burst (priming ~30 holdings' return history after an import)
  // stays comfortably under the cap.
  if (!requestAllowed(req, "history", 60)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const [symbol] = sanitizeSymbols(req.nextUrl.searchParams.get("symbol"), 1);
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  const param = (req.nextUrl.searchParams.get("range") ?? "1y").toLowerCase();
  const range = (RANGES as readonly string[]).includes(param)
    ? (param as HistoryRange)
    : "1y";

  const series = await fetchHistory(symbol, range);
  if (!series) {
    return NextResponse.json({ error: "no data" }, { status: 404 });
  }
  return NextResponse.json(series, {
    headers: {
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
