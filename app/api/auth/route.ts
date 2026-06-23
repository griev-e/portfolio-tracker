import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  checkLock,
  clientKey,
  recordFailure,
  recordSuccess,
} from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

const COOKIE = "grieve_auth";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

const lockedResponse = (retryAfter: number) =>
  NextResponse.json(
    { ok: false, error: "too_many_attempts", retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );

/** POST /api/auth { pin } — validates against ACCESS_PIN and sets the cookie. */
export async function POST(req: NextRequest) {
  const pin = process.env.ACCESS_PIN;
  if (!pin) return NextResponse.json({ ok: true }); // gate disabled

  // Brute-force guard: bounce locked-out clients before doing any work.
  const key = clientKey(req);
  const locked = checkLock(key);
  if (locked.limited) return lockedResponse(locked.retryAfter);

  let attempt = "";
  try {
    const body = (await req.json()) as { pin?: unknown };
    attempt = String(body.pin ?? "");
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Flat delay keeps brute-forcing a 4-digit space impractically slow.
  await new Promise((r) => setTimeout(r, 400));

  if (attempt !== pin) {
    const state = recordFailure(key);
    if (state.limited) return lockedResponse(state.retryAfter);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  recordSuccess(key); // clear the failure counter on success
  // SHA-256 of the PIN with a fixed application prefix (not a per-value salt);
  // the cookie never holds the PIN itself. Must match middleware.ts.
  const token = createHash("sha256").update(`grieve:${pin}`).digest("hex");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: THIRTY_DAYS,
    path: "/",
  });
  return res;
}

/** DELETE /api/auth — sign out by clearing the auth cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
