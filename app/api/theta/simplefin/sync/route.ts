import { NextResponse } from "next/server";
import { getSimplefin, putSimplefin } from "@/lib/db/state";
import { requireUser } from "@/lib/server/authState";
import { fetchAccounts } from "@/lib/server/simplefin";
import { mapSimplefin } from "@/lib/theta/simplefin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY = 86_400_000;
const FIRST_SYNC_LOOKBACK = 120 * DAY;
const OVERLAP = 7 * DAY; // re-fetch a week of overlap; dedupe (by stable id) absorbs it

/**
 * POST /api/theta/simplefin/sync — pull the user's accounts + transactions and
 * return them already mapped to theta's shapes. The client merges the result
 * into its ledger (dedup by stable id), so this route stays stateless beyond
 * advancing the stored `syncedAt`.
 */
export async function POST() {
  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const link = await getSimplefin(guard.userId);
  if (!link?.accessUrl) {
    return NextResponse.json({ error: "not_connected" }, { status: 409 });
  }

  const since = link.syncedAt
    ? new Date(new Date(link.syncedAt).getTime() - OVERLAP)
    : new Date(Date.now() - FIRST_SYNC_LOOKBACK);

  try {
    const raw = await fetchAccounts(link.accessUrl, since);
    const { accounts, transactions } = mapSimplefin(raw);
    const syncedAt = new Date().toISOString();
    await putSimplefin(guard.userId, { accessUrl: link.accessUrl, syncedAt });
    return NextResponse.json({
      accounts,
      transactions,
      syncedAt,
      errors: raw.errors ?? [],
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "fetch_failed";
    // A 401/403 from the bridge means the link is stale/revoked — surface it so
    // the UI can prompt a reconnect, but leave the stored link for the user to
    // clear deliberately.
    const status = reason === "unauthorized" ? 401 : 502;
    return NextResponse.json({ error: reason }, { status });
  }
}
