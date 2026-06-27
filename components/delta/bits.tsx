"use client";

import { motion } from "framer-motion";
import { CATEGORY_COLOR, type Category, type MonthFlow } from "@/lib/delta/data";
import { fmtUSDCompact } from "@/lib/format";

/** A rounded progress track with an animated, color-aware fill. */
export function ProgressBar({
  value,
  max,
  color = "var(--color-vio)",
  height = 6,
  delay = 0,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
  delay?: number;
}) {
  const frac = max > 0 ? value / max : 0;
  const over = frac > 1;
  const stroke = over ? "var(--color-neg)" : color;
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-white/[0.05]"
      style={{ height }}
    >
      <motion.div
        className="h-full rounded-full"
        style={{
          background: `linear-gradient(90deg, color-mix(in srgb, ${stroke} 45%, transparent), ${stroke})`,
        }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(1, frac) * 100}%` }}
        transition={{ delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/** Small category chip: colored dot + label. */
export function CategoryTag({
  category,
  className = "",
}: {
  category: Category;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] text-mute ${className}`}>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: CATEGORY_COLOR[category] }}
      />
      {category}
    </span>
  );
}

/**
 * Grouped income/expense bars over a few months — hand-built SVG-free, scaled
 * to the largest bar. Income reads green, expenses iris.
 */
export function MoneyFlowBars({
  data,
  height = 150,
}: {
  data: MonthFlow[];
  height?: number;
}) {
  const max = Math.max(...data.flatMap((d) => [d.income, d.expenses]), 1);
  return (
    <div>
      <div className="flex items-end gap-3" style={{ height }}>
        {data.map((d, i) => (
          <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="flex w-full items-end justify-center gap-1"
              style={{ height }}
            >
              <Bar
                value={d.income}
                max={max}
                height={height}
                color="var(--color-pos)"
                delay={i * 0.05}
              />
              <Bar
                value={d.expenses}
                max={max}
                height={height}
                color="var(--color-vio)"
                delay={i * 0.05 + 0.04}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3">
        {data.map((d) => (
          <div
            key={d.month}
            className="flex-1 text-center font-mono text-[10.5px] text-faint"
          >
            {d.month}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-4 font-mono text-[11px] text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-pos/70" /> income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-vio/70" /> spending
        </span>
      </div>
    </div>
  );
}

function Bar({
  value,
  max,
  height,
  color,
  delay,
}: {
  value: number;
  max: number;
  height: number;
  color: string;
  delay: number;
}) {
  const h = Math.max(2, (value / max) * height);
  return (
    <div className="group relative flex w-2.5 justify-center">
      <motion.div
        className="w-full rounded-t-[3px]"
        style={{
          background: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 35%, transparent))`,
        }}
        initial={{ height: 0 }}
        animate={{ height: h }}
        transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
      <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/90 px-1.5 py-0.5 font-mono text-[10px] text-ink opacity-0 ring-1 ring-edge transition-opacity group-hover:opacity-100">
        {fmtUSDCompact(value)}
      </span>
    </div>
  );
}
