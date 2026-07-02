"use client";

import { setSyncStatus } from "./syncStatus";

/**
 * Client persistence helpers for the authenticated (server-backed) mode.
 *
 * The alpha and theta stores keep all of their logic; in server mode they
 * hydrate from `/api/state` and push changes back through here. In open mode
 * (no auth) the stores ignore this module and use localStorage as before.
 *
 * Writes are compare-and-swap: this module tracks the revision each blob was
 * hydrated at (or last successfully wrote), sends it on every PUT, and the
 * server rejects with 409 when another device wrote in between — so two
 * signed-in devices can no longer silently overwrite each other. Conflicts and
 * persistent failures surface through `lib/syncStatus.ts` (the shells render
 * the banner) instead of vanishing into the console.
 */

export type ServerState = { portfolio: unknown | null; ledger: unknown | null };

/** Last-known server revision per blob — null means "never written". */
const revs: Record<"portfolio" | "ledger", string | null> = {
  portfolio: null,
  ledger: null,
};

let inflight: Promise<ServerState | null> | null = null;

/**
 * GET both blobs. The alpha and theta providers both call this on mount; while
 * a request is in flight they share it, so we fetch once per load. The cache
 * clears as soon as it settles, so a later reload fetches fresh.
 *
 * A resolved `ServerState` (possibly `{ portfolio: null, ledger: null }` for a
 * new user) is the "loaded" signal; `null` means the load genuinely FAILED.
 * Callers must not treat a failed load as "empty" — that could let a later save
 * overwrite good server data. Transient (network / 5xx) failures are retried a
 * couple of times before giving up; a 4xx (401 unauth, 404 disabled) is not
 * retried, since it won't be fixed by trying again.
 */
export function getServerState(): Promise<ServerState | null> {
  if (!inflight) {
    inflight = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch("/api/state", { credentials: "same-origin" });
          if (res.ok) {
            const data = (await res.json()) as ServerState & {
              portfolioRev?: string | null;
              ledgerRev?: string | null;
            };
            revs.portfolio = data.portfolioRev ?? null;
            revs.ledger = data.ledgerRev ?? null;
            return data;
          }
          if (res.status >= 400 && res.status < 500) return null;
        } catch {
          // network blip — fall through to the retry
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
      return null;
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
 * snapshot. Failures and revision conflicts are surfaced through the sync
 * banner (`lib/syncStatus.ts`), not just the console.
 */
async function put(
  path: string,
  blob: "portfolio" | "ledger",
  value: unknown
): Promise<boolean> {
  const body = JSON.stringify(value ?? null);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(path, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-base-rev": revs[blob] ?? "null",
        },
        body,
        credentials: "same-origin",
      });
      if (res.ok) {
        const data = (await res.json()) as { rev?: string };
        if (data.rev) revs[blob] = data.rev;
        setSyncStatus("ok");
        return true;
      }
      if (res.status === 409) {
        // Another device/tab wrote first. Adopt its revision so a *later*
        // deliberate edit here can still save (over the newer base), but
        // surface the conflict — this edit did NOT persist, and reloading
        // shows the newer server state.
        try {
          const data = (await res.json()) as { rev?: string | null };
          revs[blob] = data.rev ?? revs[blob];
        } catch {
          /* body optional */
        }
        setSyncStatus("conflict");
        console.error(`persist: ${path} rejected — newer revision on server`);
        return false;
      }
      // Other 4xx won't be fixed by retrying — stop.
      if (res.status >= 400 && res.status < 500) break;
    } catch {
      // network blip — fall through to the retry
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }
  setSyncStatus("error");
  console.error(`persist: failed to save ${path}`);
  return false;
}

// Saves fire immediately on each mutation — every theta/alpha edit is a single
// discrete commit (button click or input blur), never a per-keystroke burst, so
// there's nothing to coalesce and no debounce window in which to lose a change.
export const putPortfolio = (value: unknown): Promise<boolean> =>
  put("/api/state/portfolio", "portfolio", value);
export const putLedger = (value: unknown): Promise<boolean> =>
  put("/api/state/ledger", "ledger", value);
