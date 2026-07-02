import Anthropic from "@anthropic-ai/sdk";
import { clientKey } from "./rateLimit";

/**
 * Shared plumbing for the Anthropic-backed endpoints (brief, optimizer,
 * allocator, discover, theta brief). Each of those keeps its own prompt, schema,
 * model and streaming call; the boilerplate they used to duplicate — a
 * day/shape response cache, an hourly cost backstop, provider-error mapping, and
 * a per-IP request limiter — lives here. Server-only.
 */

/** Module-scope LRU+TTL cache for one endpoint's responses (resets on cold start). */
export class AiCache<T> {
  private readonly map = new Map<string, { at: number; data: T }>();
  constructor(
    private readonly ttlMs: number,
    private readonly max: number
  ) {}
  get(key: string): T | null {
    const hit = this.map.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.data;
    return null;
  }
  set(key: string, data: T): void {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { at: Date.now(), data });
  }
}

/** Fixed-window generation counter — the per-warm-instance cost backstop. */
export class GenLimiter {
  private windowStart = Date.now();
  private count = 0;
  constructor(
    private readonly windowMs: number,
    private readonly max: number
  ) {}
  limited(): boolean {
    const now = Date.now();
    if (now - this.windowStart > this.windowMs) {
      this.windowStart = now;
      this.count = 0;
    }
    return this.count >= this.max;
  }
  /** Count one generation — call when a fresh API request is actually issued. */
  record(): void {
    this.count += 1;
  }
}

/** Labels for {@link mapAnthropicError}. `timedOut` is optional — non-streaming
 *  endpoints don't surface a distinct timeout status. */
export interface AiErrorLabels {
  notConfigured: string;
  rateLimited: string;
  timedOut?: string;
  unavailable: string;
}

/**
 * Map an Anthropic SDK error to an HTTP status + client-safe message. Lives here
 * so route handlers never import the Anthropic SDK directly (it stays confined
 * to lib/server/*).
 */
export function mapAnthropicError(
  err: unknown,
  labels: AiErrorLabels
): { status: number; error: string } {
  // A key that fails auth behaves like no key at all.
  if (err instanceof Anthropic.AuthenticationError)
    return { status: 501, error: labels.notConfigured };
  if (err instanceof Anthropic.RateLimitError)
    return { status: 429, error: labels.rateLimited };
  if (
    labels.timedOut &&
    (err instanceof Anthropic.APIConnectionTimeoutError ||
      err instanceof Anthropic.APIUserAbortError)
  )
    return { status: 504, error: labels.timedOut };
  return { status: 502, error: labels.unavailable };
}

/**
 * Per-IP fixed-window limiter for the AI + search endpoints. In open mode
 * (accounts off) these routes are publicly reachable and — for the AI ones —
 * cost money, so this caps abusive churn from a single client that the daily
 * shape cache can't stop (e.g. an attacker mutating the portfolio shape to force
 * fresh generations). Warm-instance scoped like every other guard here; not a
 * substitute for an edge WAF. Return cached responses BEFORE calling this so a
 * cache hit stays free and un-throttled.
 */
const IP_WINDOW_MS = 60_000;
const IP_MAX_ENTRIES = 5000;
const ipHits = new Map<string, { at: number; count: number }>();

export function requestAllowed(req: Request, endpoint: string, max: number): boolean {
  let ip = "unknown";
  try {
    ip = clientKey(req);
  } catch {
    /* header shape varies across runtimes — fall back to a shared bucket */
  }
  const key = `${endpoint}:${ip}`;
  const now = Date.now();
  const w = ipHits.get(key);
  if (!w || now - w.at > IP_WINDOW_MS) {
    ipHits.set(key, { at: now, count: 1 });
    if (ipHits.size > IP_MAX_ENTRIES) {
      for (const [k, v] of ipHits) if (now - v.at > IP_WINDOW_MS) ipHits.delete(k);
    }
    return true;
  }
  if (w.count >= max) return false;
  w.count += 1;
  return true;
}
