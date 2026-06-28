"use client";

import { m } from "framer-motion";
import { useState } from "react";
import { useElementWidth } from "@/lib/useElementWidth";

export interface ScatterPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number; // relative weight 0..1
  color?: string;
  isBenchmark?: boolean;
}

/**
 * Growth-vs-valuation positioning map with quadrant guides. Renders in real
 * pixel coordinates (measured via ResizeObserver) so circles stay circles.
 */
export function Scatter({
  points,
  xLabel,
  yLabel,
  xFormat,
  yFormat,
  height = 380,
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  height?: number;
}) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);

  const W = width;
  const H = height;
  const PAD = { l: 46, r: 26, t: 22, b: 38 };

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xPad = (xMax - xMin) * 0.14 || 1;
  const yPad = (yMax - yMin) * 0.14 || 1;

  const x = (v: number) =>
    PAD.l + ((v - (xMin - xPad)) / (xMax - xMin + 2 * xPad)) * (W - PAD.l - PAD.r);
  const y = (v: number) =>
    H - PAD.b - ((v - (yMin - yPad)) / (yMax - yMin + 2 * yPad)) * (H - PAD.t - PAD.b);

  const xMid = (xMin + xMax) / 2;
  const yMid = (yMin + yMax) / 2;

  return (
    <div ref={containerRef} style={{ height }} className="w-full">
      {W > 0 && (
        <svg
          width={W}
          height={H}
          role="img"
          aria-label={`Scatter plot of ${yLabel} versus ${xLabel} across ${points.length} holdings.`}
        >
          <line x1={x(xMid)} x2={x(xMid)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(148,163,184,0.1)" strokeDasharray="4 5" />
          <line x1={PAD.l} x2={W - PAD.r} y1={y(yMid)} y2={y(yMid)} stroke="rgba(148,163,184,0.1)" strokeDasharray="4 5" />

          <text x={W - PAD.r} y={H - 10} textAnchor="end" fill="var(--color-faint)" className="font-mono" style={{ fontSize: 10, letterSpacing: "0.1em" }}>
            {xLabel} →
          </text>
          <text x={16} y={PAD.t + 2} fill="var(--color-faint)" className="font-mono" style={{ fontSize: 10, letterSpacing: "0.1em" }} transform={`rotate(-90 16 ${PAD.t + 2})`} textAnchor="end">
            {yLabel} →
          </text>

          {points.map((p, i) => {
            const r = p.isBenchmark ? 7 : 5 + p.size * 20;
            const active = hover === p.id;
            return (
              <m.g
                key={p.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + i * 0.04, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformOrigin: `${x(p.x)}px ${y(p.y)}px` }}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
              >
                {p.isBenchmark ? (
                  <rect
                    x={x(p.x) - r}
                    y={y(p.y) - r}
                    width={r * 2}
                    height={r * 2}
                    transform={`rotate(45 ${x(p.x)} ${y(p.y)})`}
                    fill="rgba(167,139,250,0.25)"
                    stroke="var(--color-vio)"
                    strokeWidth={1.4}
                  />
                ) : (
                  <circle
                    cx={x(p.x)}
                    cy={y(p.y)}
                    r={r}
                    fill={`${p.color ?? "#5EEAD4"}26`}
                    stroke={p.color ?? "#5EEAD4"}
                    strokeWidth={active ? 2.2 : 1.3}
                  />
                )}
                <text
                  x={x(p.x)}
                  y={y(p.y) - r - 6}
                  textAnchor="middle"
                  fill={active ? "var(--color-ink)" : "var(--color-mute)"}
                  className="font-mono"
                  style={{ fontSize: active ? 12 : 10.5 }}
                >
                  {p.label}
                </text>
                {active && (
                  <text
                    x={x(p.x)}
                    y={y(p.y) + r + 14}
                    textAnchor="middle"
                    fill="var(--color-mint)"
                    className="font-mono"
                    style={{ fontSize: 11 }}
                  >
                    {xFormat(p.x)} · {yFormat(p.y)}
                  </text>
                )}
              </m.g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
