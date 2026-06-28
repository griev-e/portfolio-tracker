"use client";

import { m, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

/**
 * Spring-animated numeric ticker. Re-targets the spring whenever `value`
 * changes, so imports / scenario tweaks glide instead of snapping. Pass
 * `from` to count up from a starting value on mount (e.g. 0).
 */
export function AnimatedNumber({
  value,
  format,
  className,
  from,
  spring = { stiffness: 80, damping: 22 },
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
  from?: number;
  spring?: { stiffness: number; damping: number };
}) {
  const sv = useSpring(from ?? value, {
    ...spring,
    restDelta: Math.max(Math.abs(value) * 1e-6, 1e-4),
  });
  useEffect(() => {
    sv.set(value);
  }, [value, sv]);
  const text = useTransform(sv, (v) => format(v));
  return <m.span className={className}>{text}</m.span>;
}
