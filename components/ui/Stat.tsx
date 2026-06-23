"use client";

import type { ReactNode } from "react";
import { AnimatedNumber } from "./AnimatedNumber";
import { Tooltip } from "./Tooltip";

export function Stat({
  label,
  value,
  format,
  sub,
  toneClass = "text-ink",
  size = "md",
  tip,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  sub?: ReactNode;
  toneClass?: string;
  size?: "sm" | "md" | "lg";
  /** When set, the label gains a hover box explaining the metric. */
  tip?: ReactNode;
}) {
  const sizeClass =
    size === "lg"
      ? "text-[30px] sm:text-[34px]"
      : size === "md"
        ? "text-[21px]"
        : "text-[16px]";
  return (
    <div>
      {tip ? (
        <Tooltip content={tip}>
          <span className="eyebrow">{label}</span>
        </Tooltip>
      ) : (
        <div className="eyebrow">{label}</div>
      )}
      <div className={`font-mono tnum ${sizeClass} font-medium ${toneClass} mt-1 leading-tight`}>
        <AnimatedNumber value={value} format={format} />
      </div>
      {sub && <div className="mt-1 text-[12px] text-mute">{sub}</div>}
    </div>
  );
}
