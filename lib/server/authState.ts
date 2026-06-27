import { auth } from "@/auth";
import { isDbConfigured } from "@/lib/db";

/**
 * Shared guard for the /api/state routes. Resolves the signed-in user id, or a
 * structured failure: 404 when the feature is disabled (no auth/DB configured —
 * open mode), 401 when configured but unauthenticated. Every query is keyed by
 * the returned `userId`, so one user can never read or write another's blob.
 */
export type Guard =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

export async function requireUser(): Promise<Guard> {
  if (!process.env.AUTH_SECRET || !isDbConfigured()) {
    return { ok: false, status: 404, error: "auth_disabled" };
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, status: 401, error: "unauthenticated" };
  return { ok: true, userId };
}

/** A persisted blob is an object or null — capped so a runaway client can't
    write an unbounded row. The client owns the shape beyond that. */
const MAX_BYTES = 2_000_000;

export type ParsedBody =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string };

export async function readStateBody(req: Request): Promise<ParsedBody> {
  const text = await req.text();
  if (text.length > MAX_BYTES) return { ok: false, status: 413, error: "too_large" };
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    return { ok: false, status: 400, error: "bad_json" };
  }
  if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
    return { ok: false, status: 400, error: "bad_shape" };
  }
  return { ok: true, value };
}
