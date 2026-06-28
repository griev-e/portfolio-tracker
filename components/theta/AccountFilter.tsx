"use client";

import { useState } from "react";
import { ACCOUNT_KIND_LABEL, type Account } from "@/lib/theta/data";

/**
 * A toolbar popover for hiding noisy accounts (e.g. brokerage churn) from the
 * transaction lists. Checked = visible. The hidden set lives on the ledger, so
 * the same filter applies on the dashboard's recent-activity table.
 */
export function AccountFilter({
  accounts,
  hidden,
  onToggle,
  onShowAll,
}: {
  accounts: Account[];
  hidden: string[];
  onToggle: (id: string) => void;
  onShowAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hiddenCount = hidden.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12.5px] transition-colors ${
          hiddenCount > 0
            ? "border-edge2 bg-white/[0.06] text-ink"
            : "border-edge text-mute hover:border-edge2 hover:text-ink"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5h14M6 10h8M9 15h2" />
        </svg>
        Accounts
        {hiddenCount > 0 && (
          <span className="rounded-full bg-vio/20 px-1.5 font-mono text-[10.5px] text-vio">
            {hiddenCount} hidden
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-edge2 bg-panel p-1.5 shadow-2xl">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="eyebrow">Show accounts</span>
              {hiddenCount > 0 && (
                <button
                  onClick={onShowAll}
                  className="text-[11.5px] text-vio/80 transition-colors hover:text-vio"
                >
                  Show all
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {accounts.length === 0 ? (
                <p className="px-2 py-3 text-center text-[12px] text-faint">No accounts.</p>
              ) : (
                accounts.map((a) => {
                  const isHidden = hidden.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => onToggle(a.id)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          isHidden ? "border-edge2 bg-transparent" : "border-vio/60 bg-vio/70"
                        }`}
                      >
                        {!isHidden && (
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                          </svg>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[12.5px] ${isHidden ? "text-faint" : "text-ink"}`}>
                          {a.name}
                        </span>
                        <span className="block text-[10.5px] text-faint">{ACCOUNT_KIND_LABEL[a.kind]}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
