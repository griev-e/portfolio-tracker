/**
 * Per-user state queries (server-only): load both app blobs, and upsert each
 * independently so saving an alpha change never clobbers the theta ledger (and
 * vice-versa). Blobs are stored opaquely — shape validation happens at the
 * route boundary; the client owns their meaning.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { openSecret, sealSecret } from "@/lib/server/secretBox";
import { getDb } from "./index";
import { type SimplefinLink, userState } from "./schema";

export type UserState = {
  portfolio: unknown | null;
  ledger: unknown | null;
  /** Revision tokens (the row's updatedAt, ISO) — null until first write.
   *  Clients echo these back on PUT so concurrent devices can't silently
   *  overwrite each other (compare-and-swap in the UPDATE predicate). */
  portfolioRev: string | null;
  ledgerRev: string | null;
};

const toRev = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

export async function getUserState(userId: string): Promise<UserState> {
  const rows = await getDb()
    .select({
      portfolio: userState.portfolio,
      ledger: userState.ledger,
      portfolioUpdatedAt: userState.portfolioUpdatedAt,
      ledgerUpdatedAt: userState.ledgerUpdatedAt,
    })
    .from(userState)
    .where(eq(userState.userId, userId))
    .limit(1);
  const row = rows[0];
  return {
    portfolio: row?.portfolio ?? null,
    ledger: row?.ledger ?? null,
    portfolioRev: toRev(row?.portfolioUpdatedAt),
    ledgerRev: toRev(row?.ledgerUpdatedAt),
  };
}

/** Outcome of a compare-and-swap write. On conflict the caller gets the
 *  server's current blob + rev so the client can surface/resolve it. */
export type PutResult =
  | { ok: true; rev: string }
  | { ok: false; conflict: true; current: unknown | null; rev: string | null };

type BlobColumn = "portfolio" | "ledger";

/**
 * Compare-and-swap upsert for one app's blob. `baseRev` is the revision the
 * client last hydrated/wrote (null = "I believe this blob is unwritten").
 * The revision check lives in the UPDATE's WHERE clause, so two racing
 * writers serialize in Postgres: exactly one matches the predicate, the other
 * gets a conflict carrying the winner's blob. Saving one app's blob never
 * touches the other's (separate columns of the same row).
 */
async function putBlob(
  userId: string,
  column: BlobColumn,
  value: unknown,
  baseRev: string | null
): Promise<PutResult> {
  const db = getDb();
  const now = new Date();
  const col = column === "portfolio" ? userState.portfolio : userState.ledger;
  const revCol =
    column === "portfolio"
      ? userState.portfolioUpdatedAt
      : userState.ledgerUpdatedAt;
  const set =
    column === "portfolio"
      ? { portfolio: value, portfolioUpdatedAt: now }
      : { ledger: value, ledgerUpdatedAt: now };

  if (baseRev === null) {
    // First write for this blob: insert the row, or CAS against a still-NULL
    // revision when the row exists (e.g. the sister app wrote first).
    const inserted = await db
      .insert(userState)
      .values({ userId, ...set })
      .onConflictDoNothing({ target: userState.userId })
      .returning({ id: userState.userId });
    if (inserted.length > 0) return { ok: true, rev: now.toISOString() };
    const updated = await db
      .update(userState)
      .set(set)
      .where(and(eq(userState.userId, userId), isNull(revCol)))
      .returning({ id: userState.userId });
    if (updated.length > 0) return { ok: true, rev: now.toISOString() };
  } else {
    const base = new Date(baseRev);
    const updated = await db
      .update(userState)
      .set(set)
      .where(
        and(
          eq(userState.userId, userId),
          Number.isNaN(base.getTime()) ? sql`false` : eq(revCol, base)
        )
      )
      .returning({ id: userState.userId });
    if (updated.length > 0) return { ok: true, rev: now.toISOString() };
  }

  // CAS failed — report the server's current truth for this blob.
  const rows = await db
    .select({ current: col, at: revCol })
    .from(userState)
    .where(eq(userState.userId, userId))
    .limit(1);
  return {
    ok: false,
    conflict: true,
    current: rows[0]?.current ?? null,
    rev: toRev(rows[0]?.at),
  };
}

export const putPortfolio = (
  userId: string,
  portfolio: unknown,
  baseRev: string | null
): Promise<PutResult> => putBlob(userId, "portfolio", portfolio, baseRev);

export const putLedger = (
  userId: string,
  ledger: unknown,
  baseRev: string | null
): Promise<PutResult> => putBlob(userId, "ledger", ledger, baseRev);

/**
 * The SimpleFIN link for a user (server-only — the access URL holds bank
 * credentials and never leaves the server). `getUserState` deliberately omits
 * this column so it can't ride along to the client via /api/state. The access
 * URL is additionally sealed at rest (AES-GCM, see lib/server/secretBox.ts) so
 * a leaked DB snapshot doesn't expose raw bank credentials; legacy plaintext
 * rows pass through `openSecret` unchanged and seal on their next write.
 */
export async function getSimplefin(userId: string): Promise<SimplefinLink | null> {
  const rows = await getDb()
    .select({ simplefin: userState.simplefin })
    .from(userState)
    .where(eq(userState.userId, userId))
    .limit(1);
  const link = (rows[0]?.simplefin as SimplefinLink | null) ?? null;
  if (!link) return null;
  try {
    return { ...link, accessUrl: openSecret(link.accessUrl) };
  } catch {
    // Sealed under a rotated AUTH_SECRET — the link is unrecoverable; treat as
    // unlinked so the user re-connects rather than sync failing opaquely.
    return null;
  }
}

export async function putSimplefin(userId: string, link: SimplefinLink): Promise<void> {
  const sealed: SimplefinLink = { ...link, accessUrl: sealSecret(link.accessUrl) };
  await getDb()
    .insert(userState)
    .values({ userId, simplefin: sealed })
    .onConflictDoUpdate({ target: userState.userId, set: { simplefin: sealed } });
}

export async function clearSimplefin(userId: string): Promise<void> {
  await getDb()
    .insert(userState)
    .values({ userId, simplefin: null })
    .onConflictDoUpdate({ target: userState.userId, set: { simplefin: null } });
}
