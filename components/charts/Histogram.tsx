"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { fmtPct, fmtUSDCompact } from "@/lib/format";

/** Terminal-value distribution with target threshold coloring. */
export function Histogram({
  bins,
  target,
  height = 160,
}: {
  bins: { x0: number; x1: number; count: number }[];
  target: number;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...bins.map((b) => b.count), 1);
  const total = bins.reduce((s, b) => s + b.count, 0);
  const hb = hover !== null ? bins[hover] : null;

  return (
    <div className="relative">
      {/* Hover read-out: how many simulated outcomes landed in this bucket. */}
      {hb && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-edge2 bg-[#0d0d0d] px-2.5 py-1.5 text-[11px] leading-tight shadow-[0_8px_28px_-6px_rgba(0,0,0,0.85)]"
          style={{
            left: `${((hover! + 0.5) / bins.length) * 100}%`,
            top: -6,
          }}
        >
          <div className="font-mono tnum text-ink">
            {hb.count.toLocaleString()} outcome{hb.count === 1 ? "" : "s"}
          </div>
          <div className="font-mono tnum text-faint">
            {fmtUSDCompact(hb.x0)} – {fmtUSDCompact(hb.x1)} ·{" "}
            {fmtPct(total > 0 ? hb.count / total : 0, 1)}
          </div>
        </div>
      )}

      <div
        className="flex items-end gap-[2px]"
        style={{ height }}
        role="img"
        aria-label={`Distribution of ${total} simulated outcomes from ${fmtUSDCompact(
          bins[0]?.x0 ?? 0
        )} to ${fmtUSDCompact(bins[bins.length - 1]?.x1 ?? 0)}.`}
      >
        {bins.map((b, i) => {
          const aboveTarget = target > 0 && b.x0 >= target;
          return (
            <motion.div
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              className="flex-1 rounded-t-[3px]"
              style={{
                background: aboveTarget
                  ? "linear-gradient(180deg, rgba(94,234,212,0.85), rgba(94,234,212,0.25))"
                  : "linear-gradient(180deg, rgba(148,163,184,0.4), rgba(148,163,184,0.12))",
                filter: hover === i ? "brightness(1.4)" : undefined,
              }}
              initial={{ height: 0 }}
              animate={{ height: `${(b.count / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.012, ease: [0.22, 1, 0.36, 1] }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-faint">
        <span>{fmtUSDCompact(bins[0]?.x0 ?? 0)}</span>
        <span>{fmtUSDCompact(bins[bins.length - 1]?.x1 ?? 0)}</span>
      </div>
    </div>
  );
}
