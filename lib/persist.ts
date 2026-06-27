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

async function put(path: string, value: unknown): Promise<void> {
  try {
    await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value ?? null),
      credentials: "same-origin",
    });
  } catch {
    // Offline / transient — in-memory state still reflects the edit; the next
    // successful save sends the latest snapshot.
  }
}

// Saves fire immediately on each mutation — every theta/alpha edit is a single
// discrete commit (button click or input blur), never a per-keystroke burst, so
// there's nothing to coalesce and no debounce window in which to lose a change.
export const putPortfolio = (value: unknown): Promise<void> =>
  put("/api/state/portfolio", value);
export const putLedger = (value: unknown): Promise<void> =>
  put("/api/state/ledger", value);
