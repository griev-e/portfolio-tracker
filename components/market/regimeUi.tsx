"use client";

import { motion } from "framer-motion";
import type { RegimeLabel } from "@/lib/analytics/regime/types";

/** Regime → accent color, shared across the Market Analysis surface. */
export const REGIME_COLOR: Record<RegimeLabel, string> = {
  "Strong Risk-On": "var(--color-pos)",
  "Risk-On": "var(--color-mint)",
  Neutral: "var(--color-sky)",
  "Risk-Off": "var(--color-warn)",
  "Strong Risk-Off": "var(--color-neg)",
};

/** Composite/layer score (-1…+1) → signed integer on a −100…+100 scale. */
export const fmtScore = (v: number): string =>
  `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;

export const scoreTone = (v: number): string =>
  v >= 0.15 ? "text-pos" : v <= -0.15 ? "text-neg" : "text-mute";

export const scoreColor = (v: number): string =>
  v >= 0.15 ? "var(--color-pos)" : v <= -0.15 ? "var(--color-neg)" : "var(--color-sky)";

/**
 * Centered ±1 score bar — losses grow left of center, gains grow right.
 * The fill eases in; re-renders animate to the new width.
 */
export function ScoreBar({
  score,
  height = 6,
  className = "",
  delay = 0,
}: {
  score: number;
  height?: number;
  className?: string;
  delay?: number;
}) {
  const neg = score < 0;
  const color = neg ? "var(--color-neg)" : "var(--color-pos)";
  return (
    <div className={`relative ${className}`} style={{ height }}>
      <div className="absolute inset-0 rounded-full bg-white/[0.05]" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
      <motion.div
        className="absolute top-0 h-full rounded-full"
        style={{
          background: `color-mix(in srgb, ${color} 78%, transparent)`,
          ...(neg ? { right: "50%" } : { left: "50%" }),
        }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(Math.abs(score), 1) * 50}%` }}
        transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
