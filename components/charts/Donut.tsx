"use client";

import { m } from "framer-motion";
import { useState } from "react";
import { fmtPct, fmtUSDCompact } from "@/lib/format";

export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  color: string;
}

/** Animated donut with center readout that follows hover. */
export function Donut({
  slices,
  size = 230,
  thickness = 26,
  centerLabel,
  centerValue,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel: string;
  centerValue: string;
}) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2 - 4;
  const c = 2 * Math.PI * r;
  const [hover, setHover] = useState<DonutSlice | null>(null);

  let offset = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = total > 0 ? s.value / total : 0;
      const arc = { ...s, frac, start: offset };
      offset += frac;
      return arc;
    });

  return (
    <div className="flex items-center gap-6 flex-wrap justify-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label={`${centerLabel} ${centerValue}, across ${arcs.length} segments.`}
        >
          {arcs.map((a, i) => (
            <m.circle
              key={a.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={hover?.id === a.id ? thickness + 5 : thickness}
              strokeDasharray={`${Math.max(a.frac * c - 3, 0.5)} ${c}`}
              strokeLinecap="butt"
              initial={{ strokeDashoffset: c * 0.25, opacity: 0 }}
              animate={{
                strokeDashoffset: -a.start * c,
                opacity: hover && hover.id !== a.id ? 0.35 : 1,
              }}
              transition={{
                strokeDashoffset: { duration: 1, delay: 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.2 },
                strokeWidth: { duration: 0.2 },
              }}
              onMouseEnter={() => setHover(a)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "default" }}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <m.div
            key={hover?.id ?? "total"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="eyebrow">{hover ? hover.label : centerLabel}</div>
            <div className="mt-1 font-mono tnum text-[20px] text-ink">
              {hover ? fmtUSDCompact(hover.value) : centerValue}
            </div>
            {hover && total > 0 && (
              <div className="mt-0.5 font-mono text-[12px] text-mute">
                {fmtPct(hover.value / total, 1)}
              </div>
            )}
          </m.div>
        </div>
      </div>
      <div className="flex max-h-[230px] min-w-0 grow basis-[110px] flex-col gap-1.5 overflow-y-auto pr-1">
        {arcs.map((a) => (
          <button
            key={a.id}
            title={a.label}
            onMouseEnter={() => setHover(a)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors ${
              hover?.id === a.id ? "bg-white/[0.04]" : ""
            }`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: a.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[12px] text-mute">{a.label}</span>
            <span className="font-mono tnum text-[12px] text-ink">
              {fmtPct(a.frac, 1)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Shared categorical palette tuned for the dark theme. */
export const PALETTE = [
  "#5EEAD4",
  "#A78BFA",
  "#7DD3FC",
  "#F0ABFC",
  "#86EFAC",
  "#FCD34D",
  "#FDA4AF",
  "#93C5FD",
  "#6EE7B7",
  "#C4B5FD",
  "#67E8F9",
  "#FDBA74",
  "#D8B4FE",
  "#A5F3FC",
  "#BEF264",
  "#F9A8D4",
];
