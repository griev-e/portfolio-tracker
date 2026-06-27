"use client";

import { motion } from "framer-motion";
import { IconButton, TrashIcon } from "@/components/theta/ui";
import { CATEGORY_COLOR, type Transaction } from "@/lib/theta/data";
import { fmtUSD } from "@/lib/format";

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** One transaction row: merchant glyph + name, category, amount, date. */
export function TxRow({
  t,
  i,
  accountName,
  onDelete,
}: {
  t: Transaction;
  i: number;
  accountName?: string;
  onDelete?: (id: string) => void;
}) {
  const accent = CATEGORY_COLOR[t.category];
  const income = t.amount > 0;
  const transfer = t.category === "Transfer";

  return (
    <motion.tr
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
        <span className="inline-flex items-center gap-1.5 text-[12px] text-mute">
          <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
          {t.category}
        </span>
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
    </motion.tr>
  );
}
