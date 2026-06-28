"use client";

/**
 * Client persistence helpers for the authenticated (server-backed) mode.
 *
 * The alpha and theta stores keep all of their logic; in server mode they
 * hydrate from `/api/state` and push changes back through here. In open mode
 * (no auth) the stores ignore this module and use localStorage as before.
 */

export type ServerState = { portfolio: unknown | null; ledger: unknown | null };

let inflight: Promise<ServerState | null> | null = null;

/**
 * GET both blobs. The alpha and theta providers both call this on mount; while
 * a request is in flight they share it, so we fetch once per load. The cache
 * clears as soon as it settles, so a later reload fetches fresh.
 */
export function getServerState(): Promise<ServerState | null> {
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch("/api/state", { credentials: "same-origin" });
        if (!res.ok) return null;
        return (await res.json()) as ServerState;
      } catch {
        return null;
      }
    })();
    void inflight.finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * Returns true when the save was acknowledged by the server. On a transient
 * failure it retries once after a short backoff before giving up; in-memory
 * state still reflects the edit, and the next successful save sends the latest
 * snapshot. A persistent failure is logged so it's diagnosable rather than
 * silently lost. (User-facing surfacing — a toast/banner — is a follow-up that
 * needs a notification primitive the app doesn't have yet.)
 */
async function put(path: string, value: unknown): Promise<boolean> {
  const body = JSON.stringify(value ?? null);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "same-origin",
      });
      if (res.ok) return true;
      // A 4xx won't be fixed by retrying — stop.
      if (res.status >= 400 && res.status < 500) break;
    } catch {
      // network blip — fall through to the retry
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }
  console.error(`persist: failed to save ${path}`);
  return false;
}

// Saves fire immediately on each mutation — every theta/alpha edit is a single
// discrete commit (button click or input blur), never a per-keystroke burst, so
// there's nothing to coalesce and no debounce window in which to lose a change.
export const putPortfolio = (value: unknown): Promise<boolean> =>
  put("/api/state/portfolio", value);
export const putLedger = (value: unknown): Promise<boolean> =>
  put("/api/state/ledger", value);
