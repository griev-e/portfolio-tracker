import { NextRequest, NextResponse } from "next/server";
import type { ThetaBriefRequest, ThetaSnapshot } from "@/lib/theta/intelligence";
import {
  thetaBriefConfigured,
  thetaBriefErrorResponse,
  thetaBriefFingerprint,
  thetaBriefRateLimited,
  generateThetaBrief,
  getCachedThetaBrief,
  setCachedThetaBrief,
} from "@/lib/server/thetaBrief";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Reject malformed bodies before anything reaches the prompt. */
function parseBody(body: unknown): ThetaBriefRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const s = (body as ThetaBriefRequest).snapshot as ThetaSnapshot | undefined;
  if (!s || typeof s !== "object") return null;
  if (
    typeof s.month !== "string" ||
    !num(s.netWorth) ||
    !num(s.netWorthDeltaPct) ||
    !num(s.income) ||
    !num(s.expenses) ||
    !num(s.savingsRate) ||
    !num(s.monthlyRecurring) ||
    !Array.isArray(s.topCategories) ||
    !Array.isArray(s.budgets) ||
    !Array.isArray(s.goals) ||
    !Array.isArray(s.upcomingRecurring)
  ) {
    return null;
  }

  const snapshot: ThetaSnapshot = {
    month: s.month.slice(0, 20),
    netWorth: s.netWorth,
    netWorthDeltaPct: s.netWorthDeltaPct,
    income: s.income,
    expenses: s.expenses,
    savingsRate: s.savingsRate,
    monthlyRecurring: s.monthlyRecurring,
    topCategories: s.topCategories
      .slice(0, 12)
      .filter((c) => typeof c?.category === "string" && num(c?.amount))
      .map((c) => ({ category: c.category.slice(0, 40), amount: c.amount })),
    budgets: s.budgets
      .slice(0, 20)
      .filter((b) => typeof b?.category === "string" && num(b?.limit) && num(b?.spent))
      .map((b) => ({ category: b.category.slice(0, 40), limit: b.limit, spent: b.spent })),
    goals: s.goals
      .slice(0, 20)
      .filter((g) => typeof g?.name === "string" && num(g?.saved) && num(g?.target) && num(g?.monthly))
      .map((g) => ({ name: g.name.slice(0, 50), saved: g.saved, target: g.target, monthly: g.monthly })),
    upcomingRecurring: s.upcomingRecurring
      .slice(0, 20)
      .filter((r) => typeof r?.name === "string" && num(r?.amount) && typeof r?.nextDate === "string")
      .map((r) => ({ name: r.name.slice(0, 50), amount: r.amount, nextDate: r.nextDate.slice(0, 10) })),
  };

  return { snapshot };
}

/**
 * POST /api/theta-brief
 * AI-written money brief for the submitted ledger snapshot. The ledger lives in
 * the browser, so the snapshot travels with the request; cached one per day per
 * ledger shape. Degrades gracefully (501) when ANTHROPIC_API_KEY is unset.
 */
export async function POST(req: NextRequest) {
  if (!thetaBriefConfigured()) {
    return NextResponse.json(
      { error: "brief not configured" },
      { status: 501, headers: { "Cache-Control": "no-store" } }
    );
  }

  let parsed: ThetaBriefRequest | null = null;
  try {
    parsed = parseBody(await req.json());
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return NextResponse.json({ error: "invalid snapshot" }, { status: 400 });
  }

  const key = thetaBriefFingerprint(parsed);
  const cached = getCachedThetaBrief(key);
  if (cached) {
    return NextResponse.json(
      { ...cached, cached: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (thetaBriefRateLimited()) {
    return NextResponse.json(
      { error: "brief provider rate limited" },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const { brief, costUSD } = await generateThetaBrief(parsed);
    const payload = { brief, generatedAt: new Date().toISOString(), cached: false, costUSD };
    setCachedThetaBrief(key, payload);
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, error } = thetaBriefErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}
