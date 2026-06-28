"use client";

import { m } from "framer-motion";

export interface RadarSeries {
  id: string;
  label: string;
  color: string;
  /** Values 0–100 matching `axes` order. */
  values: number[];
  fillOpacity?: number;
}

/** Four-plus-axis style radar with animated polygon draw-in. */
export function Radar({
  axes,
  series,
  size = 300,
}: {
  axes: string[];
  series: RadarSeries[];
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 44;
  const n = axes.length;

  const point = (axisIdx: number, value: number, radius = R) => {
    const angle = (Math.PI * 2 * axisIdx) / n - Math.PI / 2;
    const rr = (value / 100) * radius;
    return { x: cx + rr * Math.cos(angle), y: cy + rr * Math.sin(angle) };
  };

  const polygon = (values: number[]) =>
    values.map((v, i) => {
      const p = point(i, v);
      return `${p.x},${p.y}`;
    }).join(" ");

  const rings = [25, 50, 75, 100];

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={`Radar chart comparing ${series
          .map((s) => s.label)
          .join(" and ")} across ${axes.length} factors: ${axes.join(", ")}.`}
      >
        {rings.map((ring) => (
          <polygon
            key={ring}
            points={polygon(Array(n).fill(ring))}
            fill="none"
            stroke="rgba(148,163,184,0.1)"
            strokeWidth={ring === 50 ? 1.4 : 0.8}
            strokeDasharray={ring === 50 ? "0" : "3 4"}
          />
        ))}
        {axes.map((_, i) => {
          const p = point(i, 100);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="rgba(148,163,184,0.08)"
            />
          );
        })}
        {series.map((s, si) => (
          <m.g key={s.id}>
            <m.polygon
              points={polygon(s.values)}
              fill={s.color}
              fillOpacity={s.fillOpacity ?? 0.13}
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.9,
                delay: 0.15 + si * 0.18,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
            />
            {s.values.map((v, i) => {
              const p = point(i, v);
              return (
                <m.circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={3.4}
                  fill="#060708"
                  stroke={s.color}
                  strokeWidth={2}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 + si * 0.18 + i * 0.04 }}
                />
              );
            })}
          </m.g>
        ))}
        {axes.map((axis, i) => {
          const p = point(i, 122);
          return (
            <text
              key={axis}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--color-mute)"
              className="font-mono"
              style={{ fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase" }}
            >
              {axis}
            </text>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {series.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 text-[11px] text-mute">
            <span className="h-[3px] w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
