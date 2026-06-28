"use client";

import { m } from "framer-motion";
import type { ReactNode } from "react";

/** Circular score ring (0–100) with center content. */
export function Ring({
  score,
  size = 168,
  stroke = 9,
  children,
  color,
}: {
  score: number;
  size?: number;
  stroke?: number;
  children: ReactNode;
  color?: string;
}) {
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, score / 100));
  const ringColor =
    color ??
    (score >= 70
      ? "var(--color-mint)"
      : score >= 45
        ? "var(--color-warn)"
        : "var(--color-neg)");

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(148,163,184,0.1)"
          strokeWidth={stroke}
        />
        <m.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          style={{ filter: `drop-shadow(0 0 8px ${ringColor === "var(--color-mint)" ? "rgba(176,43,10,0.4)" : "rgba(251,191,36,0.3)"})` }}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
