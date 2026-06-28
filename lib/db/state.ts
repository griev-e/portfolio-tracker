/**
 * Per-user state queries (server-only): load both app blobs, and upsert each
 * independently so saving an alpha change never clobbers the theta ledger (and
 * vice-versa). Blobs are stored opaquely — shape validation happens at the
 * route boundary; the client owns their meaning.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import { type SimplefinLink, userState } from "./schema";

export type UserState = {
  portfolio: unknown | null;
  ledger: unknown | null;
};

export async function getUserState(userId: string): Promise<UserState> {
  const rows = await getDb()
    .select({ portfolio: userState.portfolio, ledger: userState.ledger })
    .from(userState)
    .where(eq(userState.userId, userId))
    .limit(1);
  const row = rows[0];
  return { portfolio: row?.portfolio ?? null, ledger: row?.ledger ?? null };
}

export async function putPortfolio(userId: string, portfolio: unknown): Promise<void> {
  const now = new Date();
  await getDb()
    .insert(userState)
    .values({ userId, portfolio, portfolioUpdatedAt: now })
    .onConflictDoUpdate({
      target: userState.userId,
      set: { portfolio, portfolioUpdatedAt: now },
    });
}

export async function putLedger(userId: string, ledger: unknown): Promise<void> {
  const now = new Date();
  await getDb()
    .insert(userState)
    .values({ userId, ledger, ledgerUpdatedAt: now })
    .onConflictDoUpdate({
      target: userState.userId,
      set: { ledger, ledgerUpdatedAt: now },
    });
}

/**
 * The SimpleFIN link for a user (server-only — the access URL holds bank
 * credentials and never leaves the server). `getUserState` deliberately omits
 * this column so it can't ride along to the client via /api/state.
 */
export async function getSimplefin(userId: string): Promise<SimplefinLink | null> {
  const rows = await getDb()
    .select({ simplefin: userState.simplefin })
    .from(userState)
    .where(eq(userState.userId, userId))
    .limit(1);
  return (rows[0]?.simplefin as SimplefinLink | null) ?? null;
}

export async function putSimplefin(userId: string, link: SimplefinLink): Promise<void> {
  await getDb()
    .insert(userState)
    .values({ userId, simplefin: link })
    .onConflictDoUpdate({ target: userState.userId, set: { simplefin: link } });
}

export async function clearSimplefin(userId: string): Promise<void> {
  await getDb()
    .insert(userState)
    .values({ userId, simplefin: null })
    .onConflictDoUpdate({ target: userState.userId, set: { simplefin: null } });
}
