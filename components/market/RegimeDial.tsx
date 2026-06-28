"use client";

import { useEffect } from "react";
import { m, useSpring, useTransform } from "framer-motion";
import type { RegimeLabel } from "@/lib/analytics/regime/types";
import { fmtScore, REGIME_COLOR } from "./regimeUi";

/** Frac (0…1) zone bands matching the engine's regime buckets (score ±0.15, ±0.45). */
const ZONES = [
  { from: 0, to: 0.275, color: "var(--color-neg)" },
  { from: 0.275, to: 0.425, color: "var(--color-warn)" },
  { from: 0.425, to: 0.575, color: "var(--color-sky)" },
  { from: 0.575, to: 0.725, color: "var(--color-mint)" },
  { from: 0.725, to: 1, color: "var(--color-pos)" },
];

/**
 * Animated radial gauge for the composite regime score. A 240° dial whose
 * track is colored by the five regime zones; an accent arc sweeps out from the
 * neutral center to the score, and the numeric reading counts up to match.
 * Hand-built SVG — no chart library.
 */
export function RegimeDial({
  score,
  regime,
  size = 280,
}: {
  score: number;
  regime: RegimeLabel;
  size?: number;
}) {
  const clamped = Math.max(-1, Math.min(1, score));
  const frac = (clamped + 1) / 2;
  const accent = REGIME_COLOR[regime];

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 16;
  const startAngle = -210;
  const sweep = 240;

  const polar = (angleDeg: number, radius = r) => {
    const a = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };
  const arcPath = (fromFrac: number, toFrac: number, radius = r) => {
    const aFrom = startAngle + fromFrac * sweep;
    const aTo = startAngle + toFrac * sweep;
    const s = polar(aFrom, radius);
    const e = polar(aTo, radius);
    const delta = aTo - aFrom;
    const large = Math.abs(delta) > 180 ? 1 : 0;
    const sweepFlag = delta >= 0 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} ${sweepFlag} ${e.x} ${e.y}`;
  };

  const markerAngle = startAngle + frac * sweep;
  const marker = polar(markerAngle);
  const fillFromCenter = Math.abs(frac - 0.5) > 0.01;

  // Count-up driven by a spring that starts at 0 on mount.
  const sv = useSpring(0, { stiffness: 90, damping: 22, restDelta: 1e-4 });
  useEffect(() => {
    sv.set(clamped);
  }, [clamped, sv]);
  const reading = useTransform(sv, (v) => fmtScore(v));

  const H = size * 0.82;

  return (
    <div style={{ width: size, height: H }} className="relative">
      <svg width={size} height={H} viewBox={`0 0 ${size} ${H}`}>
        {/* zone track */}
        {ZONES.map((z) => {
          const active = frac >= z.from && frac <= z.to;
          return (
            <m.path
              key={z.from}
              d={arcPath(z.from + 0.006, z.to - 0.006)}
              stroke={z.color}
              strokeWidth={9}
              fill="none"
              strokeLinecap="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: active ? 0.6 : 0.18 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            />
          );
        })}

        {/* zone boundary ticks */}
        {[0.275, 0.425, 0.575, 0.725].map((f) => {
          const a = startAngle + f * sweep;
          const p1 = polar(a, r - 7);
          const p2 = polar(a, r + 7);
          return (
            <line
              key={f}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="var(--color-void)"
              strokeWidth={2}
            />
          );
        })}

        {/* accent sweep from the neutral center out to the score */}
        {fillFromCenter && (
          <m.path
            d={arcPath(0.5, frac)}
            stroke={accent}
            strokeWidth={9}
            fill="none"
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 7px color-mix(in srgb, ${accent} 50%, transparent))`,
            }}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          />
        )}

        {/* marker dot */}
        <m.circle
          cx={marker.x}
          cy={marker.y}
          r={6}
          fill={accent}
          stroke="var(--color-void)"
          strokeWidth={2.5}
          style={{
            filter: `drop-shadow(0 0 8px color-mix(in srgb, ${accent} 65%, transparent))`,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.1, type: "spring", stiffness: 260, damping: 16 }}
        />

        {/* center readout */}
        <foreignObject x={cx - size * 0.32} y={cy - size * 0.2} width={size * 0.64} height={size * 0.4}>
          <div className="flex h-full flex-col items-center justify-center">
            <m.span
              className="font-mono tnum font-semibold leading-none"
              style={{ fontSize: size * 0.2, color: accent }}
            >
              {reading}
            </m.span>
            <span className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-faint">
              Risk score
            </span>
          </div>
        </foreignObject>

        {/* end labels */}
        <text
          x={polar(startAngle, r).x}
          y={polar(startAngle, r).y + 16}
          textAnchor="middle"
          fill="var(--color-faint)"
          className="font-mono"
          style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}
        >
          Risk-off
        </text>
        <text
          x={polar(startAngle + sweep, r).x}
          y={polar(startAngle + sweep, r).y + 16}
          textAnchor="middle"
          fill="var(--color-faint)"
          className="font-mono"
          style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}
        >
          Risk-on
        </text>
      </svg>
    </div>
  );
}
