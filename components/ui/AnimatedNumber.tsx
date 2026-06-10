"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

/**
 * Spring-animated numeric ticker. Re-targets the spring whenever `value`
 * changes, so imports / scenario tweaks glide instead of snapping.
 */
export function AnimatedNumber({
  value,
  format,
  className,
  spring = { stiffness: 80, damping: 22 },
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
  spring?: { stiffness: number; damping: number };
}) {
  const sv = useSpring(value, { ...spring, restDelta: Math.max(Math.abs(value) * 1e-6, 1e-4) });
  useEffect(() => {
    sv.set(value);
  }, [value, sv]);
  const text = useTransform(sv, (v) => format(v));
  return <motion.span className={className}>{text}</motion.span>;
}
