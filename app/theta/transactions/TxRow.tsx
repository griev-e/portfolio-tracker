"use client";

import { m } from "framer-motion";
import { useState } from "react";
import { IconButton, TrashIcon } from "@/components/theta/ui";
import { CATEGORIES, CATEGORY_COLOR, type Category, type Transaction } from "@/lib/theta/data";
import { fmtUSD } from "@/lib/format";

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The category cell: a static tag, or a click-to-retag picker when editable. */
function CategoryCell({
  category,
  onChange,
}: {
  category: Category;
  onChange?: (category: Category) => void;
}) {
  const [open, setOpen] = useState(false);
  const accent = CATEGORY_COLOR[category];

  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-mute">
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
        {category}
      </span>
    );
  }

  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Change category"
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-mute transition-colors hover:bg-white/[0.06] hover:text-ink"
      >
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
        {category}
        <svg width="9" height="9" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-faint">
          <path d="M1 1l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1 max-h-72 w-44 overflow-y-auto rounded-lg border border-edge2 bg-panel p-1 shadow-2xl">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => {
                  if (c !== category) onChange(c);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-white/[0.05] ${
                  c === category ? "text-ink" : "text-mute"
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[c] }} />
                {c}
                {c === category && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-vio">
                    <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/** One transaction row: merchant glyph + name, category, amount, date. */
export function TxRow({
  t,
  i,
  accountName,
  onDelete,
  onChangeCategory,
}: {
  t: Transaction;
  i: number;
  accountName?: string;
  onDelete?: (id: string) => void;
  onChangeCategory?: (id: string, category: Category) => void;
}) {
  const accent = CATEGORY_COLOR[t.category];
  const income = t.amount > 0;
  const transfer = t.category === "Transfer";

  return (
    <m.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + i * 0.025, duration: 0.3 }}
      className="group border-b border-edge/60 transition-colors last:border-0 hover:bg-white/[0.03]"
    >
      <td className="py-3 pl-6 pr-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-medium"
            style={{
              background: `color-mix(in srgb, ${accent} 16%, transparent)`,
              color: accent,
            }}
          >
            {t.merchant.charAt(0)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] text-ink">{t.merchant}</span>
              {t.pending && (
                <span className="rounded border border-warn/30 bg-warn/10 px-1 py-px font-mono text-[8.5px] uppercase tracking-wide text-warn">
                  pending
                </span>
              )}
            </div>
            <div className="text-[11px] text-faint">
              {accountName ?? t.account}
            </div>
          </div>
        </div>
      </td>

      <td className="hidden px-3 py-3 sm:table-cell">
        <CategoryCell
          category={t.category}
          onChange={onChangeCategory ? (c) => onChangeCategory(t.id, c) : undefined}
        />
      </td>

      <td className="px-3 py-3 text-right">
        <span
          className={`font-mono tnum text-[13px] ${
            income ? "text-pos" : transfer ? "text-faint" : "text-ink"
          }`}
        >
          {income ? "+" : "−"}
          {fmtUSD(Math.abs(t.amount))}
        </span>
      </td>

      <td className="py-3 pl-3 pr-6 text-right">
        <div className="flex items-center justify-end gap-1">
          <span className="font-mono tnum text-[12px] text-faint">{shortDate(t.date)}</span>
          {onDelete && (
            <span className="opacity-0 transition-opacity group-hover:opacity-100">
              <IconButton label="Delete transaction" danger onClick={() => onDelete(t.id)}>
                <TrashIcon />
              </IconButton>
            </span>
          )}
        </div>
      </td>
    </m.tr>
  );
}
