import { NextResponse } from "next/server";
import { putPortfolio } from "@/lib/db/state";
import { readStateBody, requireUser } from "@/lib/server/authState";

export const dynamic = "force-dynamic";

/**
 * PUT /api/state/portfolio — compare-and-swap upsert of the signed-in user's
 * alpha portfolio blob. The client sends the revision it last hydrated/wrote in
 * `x-base-rev` ("null" for a first write); a mismatch means another device
 * wrote in between, so the request returns 409 with the server's current
 * blob + rev instead of silently overwriting it.
 */
export async function PUT(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const body = await readStateBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const baseHeader = req.headers.get("x-base-rev");
  const baseRev = baseHeader && baseHeader !== "null" ? baseHeader : null;
  const result = await putPortfolio(guard.userId, body.value, baseRev);
  if (!result.ok) {
    return NextResponse.json(
      { error: "conflict", current: result.current, rev: result.rev },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, rev: result.rev });
}
