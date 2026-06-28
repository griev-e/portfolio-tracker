import { NextResponse } from "next/server";
import { clearSimplefin, getSimplefin } from "@/lib/db/state";
import { requireUser } from "@/lib/server/authState";

export const dynamic = "force-dynamic";

/**
 * GET /api/theta/simplefin — connection status for the signed-in user.
 * Returns only whether a link exists and when it last synced; the access URL
 * (which holds bank credentials) is never serialized to the client.
 */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const link = await getSimplefin(guard.userId);
  return NextResponse.json({ connected: !!link?.accessUrl, syncedAt: link?.syncedAt ?? null });
}

/** DELETE /api/theta/simplefin — unlink the bank (clears the stored access URL). */
export async function DELETE() {
  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  await clearSimplefin(guard.userId);
  return NextResponse.json({ connected: false, syncedAt: null });
}
