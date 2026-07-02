import { NextRequest, NextResponse } from "next/server";
import type { BriefPosition, BriefRequest } from "@/lib/intelligence/types";
import { requestAllowed } from "@/lib/server/aiEndpoint";
import {
  briefConfigured,
  briefErrorResponse,
  briefFingerprint,
  briefRateLimited,
  generateBrief,
  getCachedBrief,
  setCachedBrief,
} from "@/lib/server/brief";

export const dynamic = "force-dynamic";
// Haiku 4.5 without thinking returns well inside this; the client also caps at 30s.
export const maxDuration = 45;

const SYMBOL_RE = /[^A-Z0-9.\-]/g;

const isFinitNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isNullableNum = (v: unknown): v is number | null =>
  v === null || isFinitNum(v);

/** Reject malformed bodies before anything reaches the prompt. */
function parseBody(body: unknown): BriefRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const p = (body as BriefRequest).portfolio;
  if (typeof p !== "object" || p === null) return null;
  if (
    !isFinitNum(p.totalValue) ||
    !isNullableNum(p.dayChangePct) ||
    !isFinitNum(p.totalReturnPct) ||
    !isFinitNum(p.cashWeight) ||
    !Array.isArray(p.positions) ||
    p.positions.length === 0 ||
    p.positions.length > 60
  ) {
    return null;
  }

  const positions: BriefPosition[] = [];
  for (const pos of p.positions) {
    if (typeof pos !== "object" || pos === null) return null;
    if (
      typeof pos.symbol !== "string" ||
      typeof pos.name !== "string" ||
      !isFinitNum(pos.weight) ||
      !isNullableNum(pos.dayChangePct) ||
      !isFinitNum(pos.returnPct)
    ) {
      return null;
    }
    const symbol = pos.symbol.toUpperCase().replace(SYMBOL_RE, "").slice(0, 12);
    if (!symbol) return null;
    positions.push({
      symbol,
      name: pos.name.slice(0, 80),
      weight: pos.weight,
      dayChangePct: pos.dayChangePct,
      returnPct: pos.returnPct,
      sector: typeof pos.sector === "string" ? pos.sector.slice(0, 40) : null,
      earningsDate:
        typeof pos.earningsDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(pos.earningsDate)
          ? pos.earningsDate
          : null,
    });
  }

  return {
    portfolio: {
      totalValue: p.totalValue,
      dayChangePct: p.dayChangePct,
      totalReturnPct: p.totalReturnPct,
      cashWeight: p.cashWeight,
      positions,
    },
  };
}

/**
 * POST /api/brief
 * AI-written morning brief for the submitted portfolio snapshot. Holdings
 * live in the browser, so the snapshot travels with the request; the server
 * enriches it with headlines + earnings and caches one brief per day per
 * portfolio shape.
 */
export async function POST(req: NextRequest) {
  if (!briefConfigured()) {
    return NextResponse.json(
      { error: "brief not configured" },
      { status: 501, headers: { "Cache-Control": "no-store" } }
    );
  }

  let parsed: BriefRequest | null = null;
  try {
    parsed = parseBody(await req.json());
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return NextResponse.json({ error: "invalid portfolio" }, { status: 400 });
  }

  const key = briefFingerprint(parsed);
  const cached = getCachedBrief(key);
  if (cached) {
    return NextResponse.json(
      { ...cached, cached: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Per-IP throttle + hourly cost backstop before a fresh generation.
  if (!requestAllowed(req, "brief", 10) || briefRateLimited()) {
    return NextResponse.json(
      { error: "brief provider rate limited" },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const { brief, costUSD } = await generateBrief(parsed);
    const payload = {
      brief,
      generatedAt: new Date().toISOString(),
      cached: false,
      costUSD,
    };
    setCachedBrief(key, payload);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const { status, error } = briefErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}
