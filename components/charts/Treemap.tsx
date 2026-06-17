"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { fmtPct, fmtUSDCompact } from "@/lib/format";
import { useElementWidth } from "@/lib/useElementWidth";

export interface TreemapItem {
  id: string;
  label: string;
  value: number;
  /** Drives cell color, e.g. return % (clamped ±25%). */
  intensity: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  item: TreemapItem;
}

/** Squarified treemap layout (Bruls, Huizing & van Wijk). */
function squarify(items: TreemapItem[], x: number, y: number, w: number, h: number): Rect[] {
  const total = items.reduce((s, d) => s + d.value, 0);
  if (total <= 0 || items.length === 0) return [];
  const scaled = items
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((item) => ({ item, area: (item.value / total) * w * h }));

  const rects: Rect[] = [];
  let row: typeof scaled = [];
  let rx = x;
  let ry = y;
  let rw = w;
  let rh = h;

  const worst = (r: typeof scaled, side: number): number => {
    const sum = r.reduce((s, d) => s + d.area, 0);
    const max = Math.max(...r.map((d) => d.area));
    const min = Math.min(...r.map((d) => d.area));
    const s2 = sum * sum;
    return Math.max((side * side * max) / s2, s2 / (side * side * min));
  };

  const layoutRow = (r: typeof scaled) => {
    const sum = r.reduce((s, d) => s + d.area, 0);
    const horizontal = rw >= rh;
    const side = horizontal ? rh : rw;
    const thickness = sum / side;
    let offset = 0;
    for (const d of r) {
      const len = d.area / thickness;
      rects.push(
        horizontal
          ? { x: rx, y: ry + offset, w: thickness, h: len, item: d.item }
          : { x: rx + offset, y: ry, w: len, h: thickness, item: d.item }
      );
      offset += len;
    }
    if (horizontal) {
      rx += thickness;
      rw -= thickness;
    } else {
      ry += thickness;
      rh -= thickness;
    }
  };

  for (const d of scaled) {
    const side = Math.min(rw, rh);
    if (row.length === 0 || worst([...row, d], side) <= worst(row, side)) {
      row.push(d);
    } else {
      layoutRow(row);
      row = [d];
    }
  }
  if (row.length) layoutRow(row);
  return rects;
}

function cellColor(intensity: number): { bg: string; border: string } {
  // intensity: return fraction, clamped to ±0.25 → rose..slate..mint
  const t = Math.max(-1, Math.min(1, intensity / 0.25));
  if (t >= 0) {
    const a = 0.06 + t * 0.22;
    return {
      bg: `rgba(52, 211, 153, ${a})`,
      border: `rgba(52, 211, 153, ${0.18 + t * 0.4})`,
    };
  }
  const a = 0.06 + -t * 0.22;
  return {
    bg: `rgba(251, 113, 133, ${a})`,
    border: `rgba(251, 113, 133, ${0.18 + -t * 0.4})`,
  };
}

export function Treemap({
  items,
  height = 360,
}: {
  items: TreemapItem[];
  height?: number;
}) {
  // Real pixel coordinates: cells and labels never stretch with the viewport.
  const [wrapRef, W] = useElementWidth<HTMLDivElement>();
  const rects = useMemo(
    () => (W > 0 ? squarify(items, 0, 0, W, height) : []),
    [items, W, height]
  );
  const [active, setActive] = useState<string | null>(null);

  return (
    <div ref={wrapRef} style={{ height }} className="w-full">
      {W > 0 && (
      <svg width={W} height={height}>
        {rects.map((r, i) => {
          const { bg, border } = cellColor(r.item.intensity);
          const isActive = active === r.item.id;
          const pad = 3;
          const showLabel = r.w > 68 && r.h > 46;
          const showSub = r.w > 92 && r.h > 74;
          return (
            <motion.g
              key={r.item.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: i * 0.035, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: `${r.x + r.w / 2}px ${r.y + r.h / 2}px` }}
              onMouseEnter={() => setActive(r.item.id)}
              onMouseLeave={() => setActive(null)}
              className="cursor-default"
            >
              <rect
                x={r.x + pad}
                y={r.y + pad}
                width={Math.max(0, r.w - pad * 2)}
                height={Math.max(0, r.h - pad * 2)}
                rx={9}
                fill={bg}
                stroke={isActive ? "rgba(231,236,244,0.55)" : border}
                strokeWidth={isActive ? 2 : 1.2}
              />
              {showLabel && (
                <>
                  <text
                    x={r.x + 12}
                    y={r.y + 28}
                    fill="var(--color-ink)"
                    style={{ fontSize: 18, fontWeight: 600 }}
                    className="font-display"
                  >
                    {r.item.label}
                  </text>
                  <text
                    x={r.x + 12}
                    y={r.y + 49}
                    fill="var(--color-mute)"
                    style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}
                    className="font-mono"
                  >
                    {fmtUSDCompact(r.item.value)}
                  </text>
                  {showSub && (
                    <text
                      x={r.x + 12}
                      y={r.y + 68}
                      fill={
                        r.item.intensity >= 0
                          ? "var(--color-pos)"
                          : "var(--color-neg)"
                      }
                      style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}
                      className="font-mono"
                    >
                      {fmtPct(r.item.intensity, 1, true)}
                    </text>
                  )}
                </>
              )}
            </motion.g>
          );
        })}
      </svg>
      )}
    </div>
  );
}
