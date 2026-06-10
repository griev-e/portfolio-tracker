"use client";

import { motion } from "framer-motion";
import { fmtUSDCompact } from "@/lib/format";

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
  const max = Math.max(...bins.map((b) => b.count), 1);
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {bins.map((b, i) => {
          const aboveTarget = target > 0 && b.x0 >= target;
          return (
            <motion.div
              key={i}
              className="flex-1 rounded-t-[3px]"
              style={{
                background: aboveTarget
                  ? "linear-gradient(180deg, rgba(94,234,212,0.85), rgba(94,234,212,0.25))"
                  : "linear-gradient(180deg, rgba(148,163,184,0.4), rgba(148,163,184,0.12))",
              }}
              initial={{ height: 0 }}
              animate={{ height: `${(b.count / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.012, ease: [0.22, 1, 0.36, 1] }}
              title={`${fmtUSDCompact(b.x0)} – ${fmtUSDCompact(b.x1)}: ${b.count}`}
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
