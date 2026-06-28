"use client";

import { useState } from "react";
import { ACCOUNT_KIND_LABEL, type Account, CATEGORY_COLOR, type Category } from "@/lib/theta/data";

/**
 * A toolbar popover for filtering noisy activity out of the transaction lists
 * — both whole accounts (e.g. brokerage churn) and whole categories. Checked =
 * counted. The hidden sets live on the ledger, so the same filter applies on
 * the dashboard's recent-activity table and the income/spending math.
 */
export function TransactionFilter({
  accounts,
  categories,
  hiddenAccounts,
  hiddenCategories,
  onToggleAccount,
  onToggleCategory,
  onReset,
}: {
  accounts: Account[];
  categories: Category[];
  hiddenAccounts: string[];
  hiddenCategories: string[];
  onToggleAccount: (id: string) => void;
  onToggleCategory: (category: Category) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hiddenCount = hiddenAccounts.length + hiddenCategories.length;

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
        Filter
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
              <span className="eyebrow">Show activity from</span>
              {hiddenCount > 0 && (
                <button
                  onClick={onReset}
                  className="text-[11.5px] text-vio/80 transition-colors hover:text-vio"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="max-h-[22rem] overflow-y-auto">
              <Section label="Accounts" />
              {accounts.length === 0 ? (
                <p className="px-2 py-2 text-[12px] text-faint">No accounts.</p>
              ) : (
                accounts.map((a) => (
                  <Row
                    key={a.id}
                    checked={!hiddenAccounts.includes(a.id)}
                    onClick={() => onToggleAccount(a.id)}
                    title={a.name}
                    subtitle={ACCOUNT_KIND_LABEL[a.kind]}
                  />
                ))
              )}

              <Section label="Categories" className="mt-1" />
              {categories.length === 0 ? (
                <p className="px-2 py-2 text-[12px] text-faint">No categories.</p>
              ) : (
                categories.map((c) => (
                  <Row
                    key={c}
                    checked={!hiddenCategories.includes(c)}
                    onClick={() => onToggleCategory(c)}
                    title={c}
                    dot={CATEGORY_COLOR[c]}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`px-2 pb-1 pt-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-faint ${className}`}>
      {label}
    </div>
  );
}

function Row({
  checked,
  onClick,
  title,
  subtitle,
  dot,
}: {
  checked: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          checked ? "border-vio/60 bg-vio/70" : "border-edge2 bg-transparent"
        }`}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.5l2.5 2.5 4.5-5" />
          </svg>
        )}
      </span>
      {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[12.5px] ${checked ? "text-ink" : "text-faint"}`}>
          {title}
        </span>
        {subtitle && <span className="block text-[10.5px] text-faint">{subtitle}</span>}
      </span>
    </button>
  );
}
