/**
 * Per-user state queries (server-only): load both app blobs, and upsert each
 * independently so saving an alpha change never clobbers the theta ledger (and
 * vice-versa). Blobs are stored opaquely — shape validation happens at the
 * route boundary; the client owns their meaning.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import { userState } from "./schema";

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
