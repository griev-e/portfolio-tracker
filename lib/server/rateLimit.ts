/**
 * Brute-force protection for the login gate.
 *
 * Without throttling, an online password-guessing attack can run unbounded.
 * This is a tiny fixed-window limiter that locks a client (keyed by IP +
 * username) out after a handful of failed sign-ins. It lives in module scope
 * like the other server caches (`lib/server/*`): a warm-lambda guard that resets
 * on cold start — accepted, and not a substitute for an edge WAF, but it turns
 * online brute force from trivial into impractical.
 *
 * The gate itself is enforced by `middleware.ts`; credential validation (and
 * therefore this limiter) lives in the NextAuth Credentials provider (`auth.ts`),
 * the only place that sees raw attempts.
 */

interface Attempt {
  fails: number;
  windowStart: number;
  lockedUntil: number;
}

const ATTEMPTS = new Map<string, Attempt>();

/** Failed sign-ins tolerated inside a window before lockout. */
const MAX_FAILS = 5;
/** Failures are counted within this rolling window. */
const WINDOW_MS = 15 * 60_000;
/** How long a tripped client stays locked out. */
const LOCKOUT_MS = 15 * 60_000;
/** Bound the map so a flood of distinct IPs can't grow it without limit. */
const MAX_ENTRIES = 5000;

export interface RateLimitState {
  limited: boolean;
  /** Seconds until the caller may retry (0 unless limited). */
  retryAfter: number;
}

const lockedState = (lockedUntil: number, now: number): RateLimitState => ({
  limited: true,
  retryAfter: Math.max(1, Math.ceil((lockedUntil - now) / 1000)),
});

const OK: RateLimitState = { limited: false, retryAfter: 0 };

/** Is this client currently locked out? Call before verifying credentials. */
export function checkLock(key: string, now = Date.now()): RateLimitState {
  const a = ATTEMPTS.get(key);
  return a && a.lockedUntil > now ? lockedState(a.lockedUntil, now) : OK;
}

/** Record a failed sign-in; returns the (possibly now-locked) state. */
export function recordFailure(key: string, now = Date.now()): RateLimitState {
  let a = ATTEMPTS.get(key);
  if (!a || now - a.windowStart > WINDOW_MS) {
    a = { fails: 0, windowStart: now, lockedUntil: 0 };
  }
  a.fails += 1;
  if (a.fails >= MAX_FAILS) a.lockedUntil = now + LOCKOUT_MS;
  ATTEMPTS.set(key, a);
  prune(now);
  return a.lockedUntil > now ? lockedState(a.lockedUntil, now) : OK;
}

/** Clear a client's record after a successful sign-in. */
export function recordSuccess(key: string): void {
  ATTEMPTS.delete(key);
}

/** Derive a stable client key from proxy headers (Vercel sets x-forwarded-for). */
export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Drop stale entries only when the map gets large — cheap amortized cleanup. */
function prune(now: number): void {
  if (ATTEMPTS.size < MAX_ENTRIES) return;
  for (const [k, v] of ATTEMPTS) {
    if (v.lockedUntil <= now && now - v.windowStart > WINDOW_MS) ATTEMPTS.delete(k);
  }
}
