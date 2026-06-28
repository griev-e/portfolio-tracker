"use client";

import { m } from "framer-motion";
import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";

/**
 * 240° arc gauge. `value` is positioned within [min, max]; an optional
 * `marker` (e.g. benchmark) renders as a tick on the arc.
 */
export function Gauge({
  value,
  min,
  max,
  marker,
  label,
  format,
  color = "var(--color-mint)",
  size = 150,
  tip,
}: {
  value: number;
  min: number;
  max: number;
  marker?: { value: number; label: string };
  label: string;
  format: (v: number) => string;
  color?: string;
  size?: number;
  /** When set, hovering the gauge reveals a box explaining the metric. */
  tip?: ReactNode;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;
  const startAngle = -210;
  const endAngle = 30;
  const sweep = endAngle - startAngle; // 240°

  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const polar = (angleDeg: number, radius = r) => {
    const a = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };
  const arcPath = (fromDeg: number, toDeg: number) => {
    const s = polar(fromDeg);
    const e = polar(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const markerFrac = marker
    ? Math.max(0, Math.min(1, (marker.value - min) / (max - min)))
    : null;
  const markerAngle =
    markerFrac !== null ? startAngle + markerFrac * sweep : null;

  const body = (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg
        width={size}
        height={size * 0.82}
        viewBox={`0 0 ${size} ${size * 0.82}`}
        role="img"
        aria-label={`${label}: ${format(value)}${
          marker ? `, ${marker.label}` : ""
        }.`}
      >
        <path
          d={arcPath(startAngle, endAngle)}
          stroke="rgba(148,163,184,0.12)"
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
        />
        <m.path
          d={arcPath(startAngle, endAngle)}
          stroke={color}
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 35%, transparent))`,
          }}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: frac }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
        {markerAngle !== null && (
          <m.line
            x1={polar(markerAngle, r - 8).x}
            y1={polar(markerAngle, r - 8).y}
            x2={polar(markerAngle, r + 8).x}
            y2={polar(markerAngle, r + 8).y}
            stroke="var(--color-vio)"
            strokeWidth={2.5}
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.95 }}
            transition={{ delay: 0.6 }}
          />
        )}
        <text
          x={cx}
          y={cy + 2}
          textAnchor="middle"
          className="fill-ink font-mono"
          style={{ fontSize: size * 0.155, fontVariantNumeric: "tabular-nums" }}
        >
          {format(value)}
        </text>
        <text
          x={cx}
          y={cy + size * 0.13}
          textAnchor="middle"
          fill="var(--color-faint)"
          style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" }}
          className="font-mono"
        >
          {label}
        </text>
      </svg>
      {marker && (
        <div className="-mt-1 flex items-center gap-1.5 text-[10px] text-mute font-mono">
          <span className="inline-block h-[2px] w-3 bg-vio rounded-full" />
          {marker.label}
        </div>
      )}
    </div>
  );

  return tip ? (
    <Tooltip content={tip} underline={false}>
      {body}
    </Tooltip>
  ) : (
    body
  );
}
