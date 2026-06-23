import { NextRequest, NextResponse } from "next/server";
import type {
  ObjectiveId,
  OptimizerRequest,
  OptimizerShift,
} from "@/lib/optimizer/types";
import {
  generateOptimization,
  getCachedOptimization,
  optimizerConfigured,
  optimizerErrorResponse,
  optimizerFingerprint,
  optimizerRateLimited,
  setCachedOptimization,
} from "@/lib/server/optimizer";

export const dynamic = "force-dynamic";
// generateOptimization's own 45s abort deadline is the real ceiling (typical
// latency is much lower; 45s is tail-case headroom, not the target); this is
// just a generous platform backstop in case that deadline ever fails to fire.
export const maxDuration = 60;

const SYMBOL_RE = /[^A-Z0-9.\-]/g;
const OBJECTIVES: ObjectiveId[] = [
  "sharpe",
  "min-vol",
  "risk-parity",
  "max-div",
  "max-return",
  "income",
  "quality",
  "equal",
];

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);
const strOrNull = (v: unknown, max: number): string | null =>
  typeof v === "string" ? v.slice(0, max) : null;

type Metrics = OptimizerRequest["before"];

function parseMetrics(m: unknown): Metrics | null {
  if (typeof m !== "object" || m === null) return null;
  const x = m as Record<string, unknown>;
  if (
    !isNum(x.expectedReturnPct) ||
    !isNum(x.volatilityPct) ||
    !isNum(x.sharpe) ||
    !isNum(x.diversification) ||
    !isNum(x.effectiveN) ||
    !isNum(x.topWeightPct) ||
    !isNum(x.yieldPct) ||
    !isNum(x.beta)
  ) {
    return null;
  }
  return {
    expectedReturnPct: x.expectedReturnPct,
    volatilityPct: x.volatilityPct,
    sharpe: x.sharpe,
    diversification: x.diversification,
    effectiveN: x.effectiveN,
    topWeightPct: x.topWeightPct,
    yieldPct: x.yieldPct,
    beta: x.beta,
  };
}

/** Reject malformed bodies before anything reaches the prompt. */
function parseBody(body: unknown): OptimizerRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const obj = b.objective as { id?: unknown; label?: unknown } | undefined;
  if (
    !obj ||
    typeof obj.id !== "string" ||
    !OBJECTIVES.includes(obj.id as ObjectiveId) ||
    typeof obj.label !== "string"
  ) {
    return null;
  }

  const con = b.constraints as
    | { maxWeightPct?: unknown; minWeightPct?: unknown }
    | undefined;
  if (!con || !isNum(con.maxWeightPct) || !isNum(con.minWeightPct)) return null;

  const before = parseMetrics(b.before);
  const after = parseMetrics(b.after);
  if (!before || !after) return null;

  if (!isNum(b.turnoverPct) || !isNum(b.cashWeightPct)) return null;
  if (!Array.isArray(b.shifts) || b.shifts.length === 0 || b.shifts.length > 40)
    return null;

  const shifts: OptimizerShift[] = [];
  for (const s of b.shifts) {
    if (typeof s !== "object" || s === null) return null;
    const x = s as Record<string, unknown>;
    if (
      typeof x.symbol !== "string" ||
      typeof x.name !== "string" ||
      !isNum(x.currentPct) ||
      !isNum(x.targetPct) ||
      !isNum(x.deltaPct)
    ) {
      return null;
    }
    const symbol = x.symbol.toUpperCase().replace(SYMBOL_RE, "").slice(0, 12);
    if (!symbol) return null;
    shifts.push({
      symbol,
      name: x.name.slice(0, 80),
      sector: strOrNull(x.sector, 40),
      currentPct: x.currentPct,
      targetPct: x.targetPct,
      deltaPct: x.deltaPct,
      forwardPE: numOrNull(x.forwardPE),
      dividendYieldPct: numOrNull(x.dividendYieldPct),
      roicPct: numOrNull(x.roicPct),
      beta: numOrNull(x.beta),
      volPct: numOrNull(x.volPct),
    });
  }

  return {
    objective: { id: obj.id as ObjectiveId, label: obj.label.slice(0, 60) },
    constraints: {
      maxWeightPct: con.maxWeightPct,
      minWeightPct: con.minWeightPct,
    },
    before,
    after,
    turnoverPct: b.turnoverPct,
    cashWeightPct: b.cashWeightPct,
    shifts,
  };
}

/**
 * POST /api/optimize
 * AI review of a quantitative optimization for the submitted portfolio snapshot.
 * The optimal weights are solved client-side; this asks Claude Sonnet 4.6 for
 * the institutional read, and caches one review per day per objective + shape.
 */
export async function POST(req: NextRequest) {
  if (!optimizerConfigured()) {
    return NextResponse.json(
      { error: "optimizer not configured" },
      { status: 501, headers: { "Cache-Control": "no-store" } }
    );
  }

  let parsed: OptimizerRequest | null = null;
  try {
    parsed = parseBody(await req.json());
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return NextResponse.json({ error: "invalid optimization" }, { status: 400 });
  }

  const key = optimizerFingerprint(parsed);
  const cached = getCachedOptimization(key);
  if (cached) {
    return NextResponse.json(
      { ...cached, cached: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Cost backstop: refuse a fresh generation once the hourly cap is hit.
  if (optimizerRateLimited()) {
    return NextResponse.json(
      { error: "optimizer rate limited" },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const { plan, costUSD } = await generateOptimization(parsed);
    const payload = {
      plan,
      generatedAt: new Date().toISOString(),
      cached: false,
      costUSD,
    };
    setCachedOptimization(key, payload);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const { status, error } = optimizerErrorResponse(err);
    // The route maps every failure to a generic status + message for the
    // client; log the real cause server-side so it's diagnosable.
    if (status === 502) console.error("optimizer generation failed:", err);
    return NextResponse.json({ error }, { status });
  }
}
