import { NextResponse } from "next/server";
import { getRegimeReport } from "@/lib/server/marketData";

export const dynamic = "force-dynamic";

/**
 * GET /api/market
 * Market regime report: ~23 daily series → 8 analytical layers → composite
 * regime, confidence, health, and drivers. Computed server-side and cached
 * (module scope + CDN) since the inputs only move once per session.
 */
export async function GET() {
  try {
    const report = await getRegimeReport();
    return NextResponse.json(report, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "market data provider unavailable" },
      { status: 502 }
    );
  }
}
