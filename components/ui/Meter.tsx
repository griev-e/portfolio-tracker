"use client";

import { motion } from "framer-motion";

/**
 * Animated horizontal bar with an optional benchmark tick. `value` and
 * `benchmark` are fractions of `max`.
 */
export function Meter({
  value,
  max = 1,
  benchmark,
  color = "var(--color-mint)",
  height = 7,
  delay = 0,
}: {
  value: number;
  max?: number;
  benchmark?: number;
  color?: string;
  height?: number;
  delay?: number;
}) {
  const frac = Math.max(0, Math.min(1, value / max));
  const benchFrac =
    benchmark !== undefined ? Math.max(0, Math.min(1, benchmark / max)) : null;
  return (
    <div
      className="relative w-full overflow-visible rounded-full bg-white/[0.05]"
      style={{ height }}
    >
      <motion.div
        className="h-full rounded-full"
        style={{
          background: `linear-gradient(90deg, ${color}55, ${color})`,
          boxShadow: `0 0 12px -2px ${color}66`,
        }}
        initial={{ width: 0 }}
        animate={{ width: `${frac * 100}%` }}
        transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      />
      {benchFrac !== null && (
        <motion.div
          className="absolute top-1/2 w-[2px] rounded-full bg-vio"
          style={{ height: height + 8, translateY: "-50%" }}
          initial={{ left: 0, opacity: 0 }}
          animate={{ left: `${benchFrac * 100}%`, opacity: 0.9 }}
          transition={{ duration: 0.8, delay: delay + 0.15 }}
          title="benchmark"
        />
      )}
    </div>
  );
}
