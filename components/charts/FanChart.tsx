"use client";

import { m } from "framer-motion";
import { useMemo, useState } from "react";
import { fmtUSDCompact } from "@/lib/format";
import { useElementWidth } from "@/lib/useElementWidth";
import type { MonteCarloResult } from "@/lib/analytics/montecarlo";

/**
 * Monte Carlo fan chart: layered percentile bands (5–95, 25–75), the median
 * path, ghost sample paths, target line, and a hover crosshair readout.
 * Rendered in real pixel coordinates so text and markers never stretch.
 */
export function FanChart({
  result,
  target,
  height = 380,
}: {
  result: MonteCarloResult;
  target: number;
  height?: number;
}) {
  const [wrapRef, W] = useElementWidth<HTMLDivElement>();
  const H = height;
  const PAD = { l: 10, r: 64, t: 14, b: 26 };
  const { bands, samplePaths } = result;
  const months = bands[bands.length - 1].month;

  const maxY = useMemo(() => {
    const top = Math.max(bands[bands.length - 1].p95, target || 0);
    return top * 1.06;
  }, [bands, target]);
  const minY = 0;

  const x = (m: number) => PAD.l + (m / months) * (W - PAD.l - PAD.r);
  const y = (v: number) =>
    H - PAD.b - ((v - minY) / (maxY - minY)) * (H - PAD.t - PAD.b);

  const line = (get: (b: (typeof bands)[number]) => number) =>
    bands.map((b, i) => `${i === 0 ? "M" : "L"} ${x(b.month)} ${y(get(b))}`).join(" ");

  const area = (
    hi: (b: (typeof bands)[number]) => number,
    lo: (b: (typeof bands)[number]) => number
  ) => {
    const up = bands.map((b, i) => `${i === 0 ? "M" : "L"} ${x(b.month)} ${y(hi(b))}`).join(" ");
    const down = [...bands]
      .reverse()
      .map((b) => `L ${x(b.month)} ${y(lo(b))}`)
      .join(" ");
    return `${up} ${down} Z`;
  };

  const [hm, setHm] = useState<number | null>(null);
  const hovered = useMemo(() => {
    if (hm === null) return null;
    let best = bands[0];
    for (const b of bands) {
      if (Math.abs(b.month - hm) < Math.abs(best.month - hm)) best = b;
    }
    return best;
  }, [hm, bands]);

  const yearTicks = useMemo(() => {
    const years = months / 12;
    const step = years > 20 ? 5 : years > 8 ? 2 : 1;
    const ticks: number[] = [];
    for (let yr = step; yr <= years; yr += step) ticks.push(yr);
    return ticks;
  }, [months]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = maxY / 5;
    for (let v = step; v < maxY; v += step) ticks.push(v);
    return ticks;
  }, [maxY]);

  return (
    <div ref={wrapRef} className="w-full">
      {W > 0 && (
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={`Monte Carlo projection over ${Math.round(months / 12)} years. Median outcome ${fmtUSDCompact(
          bands[bands.length - 1].p50
        )}; 5th to 95th percentile ${fmtUSDCompact(
          bands[bands.length - 1].p5
        )} to ${fmtUSDCompact(bands[bands.length - 1].p95)}.`}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const m = ((px - PAD.l) / (W - PAD.l - PAD.r)) * months;
          setHm(Math.max(0, Math.min(months, m)));
        }}
        onMouseLeave={() => setHm(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(v)}
              y2={y(v)}
              stroke="rgba(148,163,184,0.07)"
            />
            <text
              x={W - PAD.r + 8}
              y={y(v) + 4}
              fill="var(--color-faint)"
              className="font-mono"
              style={{ fontSize: 11 }}
            >
              {fmtUSDCompact(v)}
            </text>
          </g>
        ))}
        {yearTicks.map((yr) => (
          <text
            key={yr}
            x={x(yr * 12)}
            y={H - 10}
            textAnchor="middle"
            fill="var(--color-faint)"
            className="font-mono"
            style={{ fontSize: 11 }}
          >
            {yr}y
          </text>
        ))}

        {/* ghost sample paths */}
        {samplePaths.map((path, i) => (
          <m.path
            key={i}
            d={path
              .map(
                (v, m) =>
                  `${m === 0 ? "M" : "L"} ${x((m / (path.length - 1)) * months)} ${y(
                    Math.min(v, maxY)
                  )}`
              )
              .join(" ")}
            fill="none"
            stroke="rgba(125,211,252,0.1)"
            strokeWidth={1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 + i * 0.02, duration: 0.6 }}
          />
        ))}

        {/* percentile fans */}
        <m.path
          d={area((b) => b.p95, (b) => b.p5)}
          fill="rgba(176,43,10,0.07)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.15 }}
        />
        <m.path
          d={area((b) => b.p75, (b) => b.p25)}
          fill="rgba(176,43,10,0.14)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
        <m.path
          d={line((b) => b.p50)}
          fill="none"
          stroke="var(--color-mint)"
          strokeWidth={2.4}
          style={{ filter: "drop-shadow(0 0 6px rgba(176,43,10,0.45))" }}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* target line */}
        {target > 0 && target < maxY && (
          <m.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(target)}
              y2={y(target)}
              stroke="var(--color-warn)"
              strokeWidth={1.4}
              strokeDasharray="6 5"
              opacity={0.8}
            />
            <text
              x={W - PAD.r + 8}
              y={y(target) + 4}
              fill="var(--color-warn)"
              className="font-mono"
              style={{ fontSize: 11 }}
            >
              target
            </text>
          </m.g>
        )}

        {/* hover crosshair */}
        {hovered && (
          <g>
            <line
              x1={x(hovered.month)}
              x2={x(hovered.month)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke="rgba(231,236,244,0.25)"
              strokeWidth={1}
            />
            {(
              [
                ["p95", hovered.p95],
                ["p75", hovered.p75],
                ["p50", hovered.p50],
                ["p25", hovered.p25],
                ["p5", hovered.p5],
              ] as const
            ).map(([k, v]) => (
              <circle
                key={k}
                cx={x(hovered.month)}
                cy={y(v)}
                r={k === "p50" ? 4 : 2.6}
                fill={k === "p50" ? "var(--color-mint)" : "#060708"}
                stroke="var(--color-mint)"
                strokeWidth={1.4}
              />
            ))}
          </g>
        )}
      </svg>
      )}
      <div className="mt-1 flex h-6 items-center justify-between px-1 font-mono text-[11px] text-mute">
        <span>
          {hovered
            ? `${(hovered.month / 12).toFixed(1)}y`
            : "hover for percentile readout"}
        </span>
        {hovered && (
          <span className="tnum">
            p5 {fmtUSDCompact(hovered.p5)} · p25 {fmtUSDCompact(hovered.p25)} ·{" "}
            <span className="text-mint">p50 {fmtUSDCompact(hovered.p50)}</span> · p75{" "}
            {fmtUSDCompact(hovered.p75)} · p95 {fmtUSDCompact(hovered.p95)}
          </span>
        )}
      </div>
    </div>
  );
}
