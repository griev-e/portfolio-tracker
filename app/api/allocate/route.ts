import { NextRequest, NextResponse } from "next/server";
import type { AllocatorPosition, AllocatorRequest } from "@/lib/allocator/types";
import {
  allocatorConfigured,
  allocatorErrorResponse,
  allocatorFingerprint,
  allocatorRateLimited,
  generateAllocation,
  getCachedPlan,
  setCachedPlan,
} from "@/lib/server/allocator";

export const dynamic = "force-dynamic";
// Sonnet with adaptive thinking can run longer than the brief; streaming keeps
// the connection warm and generateAllocation enforces a hard 55s abort deadline
// inside this window.
export const maxDuration = 60;

const SYMBOL_RE = /[^A-Z0-9.\-]/g;

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isNullableNum = (v: unknown): v is number | null =>
  v === null || isNum(v);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);
const strOrNull = (v: unknown, max: number): string | null =>
  typeof v === "string" ? v.slice(0, max) : null;

/** Reject malformed bodies before anything reaches the prompt. */
function parseBody(body: unknown): AllocatorRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const p = (body as AllocatorRequest).portfolio;
  if (typeof p !== "object" || p === null) return null;
  if (
    !isNum(p.totalValue) ||
    !isNum(p.equityValue) ||
    !isNum(p.cash) ||
    !isNum(p.cashWeight) ||
    !isNum(p.deployable) ||
    !isNum(p.totalReturnPct) ||
    !Array.isArray(p.positions) ||
    p.positions.length === 0 ||
    p.positions.length > 60
  ) {
    return null;
  }

  const positions: AllocatorPosition[] = [];
  for (const pos of p.positions) {
    if (typeof pos !== "object" || pos === null) return null;
    if (
      typeof pos.symbol !== "string" ||
      typeof pos.name !== "string" ||
      !isNum(pos.weight) ||
      !isNum(pos.returnPct) ||
      !isNullableNum(pos.dayChangePct)
    ) {
      return null;
    }
    const symbol = pos.symbol.toUpperCase().replace(SYMBOL_RE, "").slice(0, 12);
    if (!symbol) return null;
    positions.push({
      symbol,
      name: pos.name.slice(0, 80),
      weight: pos.weight,
      sector: strOrNull(pos.sector, 40),
      returnPct: pos.returnPct,
      dayChangePct: pos.dayChangePct,
      forwardPE: numOrNull(pos.forwardPE),
      fcfYield: numOrNull(pos.fcfYield),
      dividendYield: numOrNull(pos.dividendYield),
      roic: numOrNull(pos.roic),
      revenueGrowth: numOrNull(pos.revenueGrowth),
      beta: numOrNull(pos.beta),
      volatility: numOrNull(pos.volatility),
      analystRating: strOrNull(pos.analystRating, 20),
      analystUpside: numOrNull(pos.analystUpside),
    });
  }

  return {
    portfolio: {
      totalValue: p.totalValue,
      equityValue: p.equityValue,
      cash: p.cash,
      cashWeight: p.cashWeight,
      deployable: p.deployable,
      totalReturnPct: p.totalReturnPct,
      positions,
    },
  };
}

/**
 * POST /api/allocate
 * AI deployment plan for the submitted portfolio snapshot. Holdings live in the
 * browser, so the snapshot travels with the request; the server validates it,
 * asks Claude how to deploy the available dry powder, and caches one plan per
 * day per portfolio shape.
 */
export async function POST(req: NextRequest) {
  if (!allocatorConfigured()) {
    return NextResponse.json(
      { error: "allocator not configured" },
      { status: 501, headers: { "Cache-Control": "no-store" } }
    );
  }

  let parsed: AllocatorRequest | null = null;
  try {
    parsed = parseBody(await req.json());
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return NextResponse.json({ error: "invalid portfolio" }, { status: 400 });
  }

  const key = allocatorFingerprint(parsed);
  const cached = getCachedPlan(key);
  if (cached) {
    return NextResponse.json(
      { ...cached, cached: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Cost backstop: refuse a fresh generation once the hourly cap is hit.
  if (allocatorRateLimited()) {
    return NextResponse.json(
      { error: "allocator rate limited" },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const { plan, costUSD } = await generateAllocation(parsed);
    const payload = {
      plan,
      generatedAt: new Date().toISOString(),
      cached: false,
      costUSD,
    };
    setCachedPlan(key, payload);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const { status, error } = allocatorErrorResponse(err);
    if (status === 502) console.error("allocation generation failed:", err);
    return NextResponse.json({ error }, { status });
  }
}
