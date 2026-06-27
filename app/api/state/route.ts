import { NextResponse } from "next/server";
import { getUserState } from "@/lib/db/state";
import { requireUser } from "@/lib/server/authState";

export const dynamic = "force-dynamic";

/** GET /api/state — both app blobs for the signed-in user. */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const state = await getUserState(guard.userId);
  return NextResponse.json(state);
}
