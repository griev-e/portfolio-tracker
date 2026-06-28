import { NextResponse } from "next/server";
import { putSimplefin } from "@/lib/db/state";
import { requireUser } from "@/lib/server/authState";
import { claimSetupToken } from "@/lib/server/simplefin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/theta/simplefin/claim — body `{ token }`.
 * Exchanges a SimpleFIN setup token for an access URL and stores it for the
 * signed-in user. The token and the resulting access URL never round-trip to
 * the client; only `{ connected: true }` comes back.
 */
export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  let token: unknown;
  try {
    token = (await req.json())?.token;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (typeof token !== "string" || token.trim().length === 0) {
    return NextResponse.json({ error: "token_required" }, { status: 400 });
  }

  try {
    const accessUrl = await claimSetupToken(token);
    await putSimplefin(guard.userId, { accessUrl, syncedAt: null });
    return NextResponse.json({ connected: true });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "claim_failed";
    const status = reason === "invalid_token" || reason === "token_spent" ? 400 : 502;
    return NextResponse.json({ error: reason }, { status });
  }
}
