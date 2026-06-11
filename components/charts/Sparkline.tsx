"use client";

import { useElementWidth } from "@/lib/useElementWidth";

/**
 * Compact line chart with an optional reference baseline. Renders in real
 * pixel coordinates (ResizeObserver) so the line never warps.
 */
export function Sparkline({
  values,
  height = 64,
  baseline,
  color = "var(--color-mint)",
  belowColor,
}: {
  values: number[];
  height?: number;
  /** Draw a dashed reference line at this value (e.g. 0). */
  baseline?: number;
  color?: string;
  /** If set, the line uses this color while the latest value < baseline. */
  belowColor?: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();

  if (values.length < 2) {
    return <div ref={ref} style={{ height }} className="w-full" />;
  }

  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (baseline !== undefined) {
    lo = Math.min(lo, baseline);
    hi = Math.max(hi, baseline);
  }
  const span = hi - lo || 1;
  const pad = span * 0.08;
  lo -= pad;
  hi += pad;

  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;

  const last = values[values.length - 1];
  const stroke =
    belowColor !== undefined && baseline !== undefined && last < baseline
      ? belowColor
      : color;

  const line = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          <path
            d={area}
            fill={`color-mix(in srgb, ${stroke} 10%, transparent)`}
          />
          {baseline !== undefined && (
            <line
              x1={0}
              x2={width}
              y1={y(baseline)}
              y2={y(baseline)}
              stroke="rgba(255,255,255,0.14)"
              strokeDasharray="3 4"
            />
          )}
          <path d={line} fill="none" stroke={stroke} strokeWidth={1.6} />
          <circle
            cx={x(values.length - 1)}
            cy={y(last)}
            r={2.8}
            fill={stroke}
          />
        </svg>
      )}
    </div>
  );
}
