import { NextRequest, NextResponse } from "next/server";
import type { DiscoverPosition, DiscoverRequest } from "@/lib/discover/types";
import { aiRequestAllowed } from "@/lib/server/aiEndpoint";
import {
  discoverConfigured,
  discoverErrorResponse,
  discoverFingerprint,
  discoverRateLimited,
  generateDiscover,
  getCachedDiscover,
  isDiscoverMode,
  setCachedDiscover,
} from "@/lib/server/discover";

export const dynamic = "force-dynamic";
// Sonnet with adaptive thinking can run longer; streaming keeps the connection warm.
export const maxDuration = 60;

const SYMBOL_RE = /[^A-Z0-9.\-]/g;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);
const strOrNull = (v: unknown, max: number): string | null =>
  typeof v === "string" ? v.slice(0, max) : null;

/** Reject malformed bodies before anything reaches the prompt. */
function parseBody(body: unknown): DiscoverRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as DiscoverRequest;
  if (!isDiscoverMode(b.mode)) return null;
  const p = b.portfolio;
  if (typeof p !== "object" || p === null) return null;
  const m = p.metrics;
  if (
    !isNum(p.totalValue) ||
    !isNum(p.cashWeightPct) ||
    typeof m !== "object" ||
    m === null ||
    !isNum(m.expectedReturnPct) ||
    !isNum(m.volatilityPct) ||
    !isNum(m.sharpe) ||
    !isNum(m.beta) ||
    !isNum(m.effectiveHoldings) ||
    !Array.isArray(p.positions) ||
    p.positions.length === 0 ||
    p.positions.length > 60
  ) {
    return null;
  }

  const positions: DiscoverPosition[] = [];
  for (const pos of p.positions) {
    if (typeof pos !== "object" || pos === null) return null;
    if (typeof pos.symbol !== "string" || typeof pos.name !== "string" || !isNum(pos.weight))
      return null;
    const symbol = pos.symbol.toUpperCase().replace(SYMBOL_RE, "").slice(0, 12);
    if (!symbol) return null;
    positions.push({
      symbol,
      name: pos.name.slice(0, 80),
      weight: pos.weight,
      sector: strOrNull(pos.sector, 40),
      forwardPE: numOrNull(pos.forwardPE),
      dividendYield: numOrNull(pos.dividendYield),
      roic: numOrNull(pos.roic),
      revenueGrowth: numOrNull(pos.revenueGrowth),
      beta: numOrNull(pos.beta),
      volatility: numOrNull(pos.volatility),
    });
  }

  return {
    mode: b.mode,
    portfolio: {
      totalValue: p.totalValue,
      cashWeightPct: p.cashWeightPct,
      metrics: {
        expectedReturnPct: m.expectedReturnPct,
        volatilityPct: m.volatilityPct,
        sharpe: m.sharpe,
        beta: m.beta,
        effectiveHoldings: m.effectiveHoldings,
      },
      positions,
    },
  };
}

/**
 * POST /api/discover
 * AI research ideas for the submitted portfolio snapshot + research mode.
 * Holdings live in the browser, so the snapshot travels with the request; the
 * server validates it, asks Claude for new names that fit, and caches one set
 * per day per (mode + portfolio shape).
 */
export async function POST(req: NextRequest) {
  if (!discoverConfigured()) {
    return NextResponse.json(
      { error: "discover not configured" },
      { status: 501, headers: { "Cache-Control": "no-store" } }
    );
  }

  let parsed: DiscoverRequest | null = null;
  try {
    parsed = parseBody(await req.json());
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const key = discoverFingerprint(parsed);
  const cached = getCachedDiscover(key);
  if (cached) {
    return NextResponse.json(
      { ...cached, cached: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Per-IP throttle + hourly cost backstop before a fresh generation.
  if (!aiRequestAllowed(req, "discover", 8) || discoverRateLimited()) {
    return NextResponse.json(
      { error: "discover rate limited" },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const { plan, costUSD } = await generateDiscover(parsed);
    const payload = {
      plan,
      mode: parsed.mode,
      generatedAt: new Date().toISOString(),
      cached: false,
      costUSD,
    };
    setCachedDiscover(key, payload);
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, error } = discoverErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}
