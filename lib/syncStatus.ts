"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny module-scope status channel for server persistence, set by
 * `lib/persist.ts` and rendered by the shells' sync banner. Exists so a failed
 * or conflicted save is *visible* — the one honesty gap the app had: every
 * data source is provenance-tracked, but a save that never reached the server
 * used to vanish into console.error.
 *
 * States:
 *   ok       — saves are landing (or nothing has been saved yet).
 *   error    — the last save failed after retries; local edits live in this
 *              tab only until a later save succeeds.
 *   conflict — the server rejected a save because another device/tab wrote
 *              first; reloading picks up the newer server state.
 */
export type SyncState = "ok" | "error" | "conflict";

let state: SyncState = "ok";
const listeners = new Set<() => void>();

export function setSyncStatus(next: SyncState): void {
  if (next === state) return;
  state = next;
  for (const l of listeners) l();
}

export function getSyncStatus(): SyncState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Live sync status for the banner (SSR snapshot is always "ok"). */
export function useSyncStatus(): SyncState {
  return useSyncExternalStore(subscribe, getSyncStatus, () => "ok" as const);
}
