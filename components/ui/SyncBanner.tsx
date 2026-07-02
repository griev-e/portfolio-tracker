"use client";

import { useSyncStatus } from "@/lib/syncStatus";

/**
 * Persistent-save health banner (server-backed mode only — in open/localStorage
 * mode the status never leaves "ok" and nothing renders). The data-provenance
 * counterpart for *writes*: a save that failed or lost a revision race is
 * surfaced here instead of dying in the console.
 */
export function SyncBanner() {
  const status = useSyncStatus();
  if (status === "ok") return null;

  const conflict = status === "conflict";
  return (
    <div
      role="alert"
      className="mx-auto mb-4 flex max-w-3xl items-center gap-3 rounded-xl border border-warn/40 bg-warn/[0.07] px-4 py-2.5 text-[12.5px] text-warn"
    >
      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-warn" />
      <span className="flex-1 leading-snug">
        {conflict
          ? "This data was changed from another device or tab — your last edit here wasn't saved. Reload to pick up the latest version before editing further."
          : "Changes aren't reaching the server. Your edits are safe in this tab and will retry on your next change."}
      </span>
      {conflict && (
        <button
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-md border border-warn/40 px-2.5 py-1 font-mono text-[11px] transition-colors hover:bg-warn/10"
        >
          Reload
        </button>
      )}
    </div>
  );
}
