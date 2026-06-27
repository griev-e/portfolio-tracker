import { NextResponse } from "next/server";
import { putLedger } from "@/lib/db/state";
import { readStateBody, requireUser } from "@/lib/server/authState";

export const dynamic = "force-dynamic";

/** PUT /api/state/ledger — upsert the signed-in user's delta blob. */
export async function PUT(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const body = await readStateBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  await putLedger(guard.userId, body.value);
  return NextResponse.json({ ok: true });
}
