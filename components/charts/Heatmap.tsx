"use client";

import { motion } from "framer-motion";
import { useState } from "react";

/**
 * Correlation heatmap. Cells fade in along the diagonal; hovering highlights
 * the full row + column crosshair and shows the pair readout.
 */
export function Heatmap({
  symbols,
  matrix,
}: {
  symbols: string[];
  matrix: number[][];
}) {
  const n = symbols.length;
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);

  const color = (rho: number, isDiag: boolean): string => {
    if (isDiag) return "rgba(231,236,244,0.13)";
    // 0 → cool slate, 0.5 → violet, 1 → hot mint glow
    const t = Math.max(0, Math.min(1, rho));
    if (t < 0.5) {
      const k = t / 0.5;
      return `rgba(${Math.round(96 + k * 71)}, ${Math.round(140 - k * 1)}, ${Math.round(
        200 + k * 50
      )}, ${0.1 + k * 0.38})`;
    }
    const k = (t - 0.5) / 0.5;
    return `rgba(${Math.round(167 - k * 73)}, ${Math.round(139 + k * 95)}, ${Math.round(
      250 - k * 38
    )}, ${0.48 + k * 0.42})`;
  };

  const hoverInfo =
    hover && hover.i !== hover.j
      ? {
          a: symbols[hover.i],
          b: symbols[hover.j],
          rho: matrix[hover.i][hover.j],
        }
      : null;

  return (
    <div>
      <div
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `minmax(44px, auto) repeat(${n}, minmax(0, 1fr))`,
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* header row */}
        <div />
        {symbols.map((s, j) => (
          <div
            key={`h-${s}`}
            className={`pb-1 text-center font-mono text-[9.5px] tracking-wide transition-colors ${
              hover?.j === j ? "text-mint" : "text-faint"
            }`}
          >
            {s}
          </div>
        ))}
        {symbols.map((rowSym, i) => (
          <Row
            key={rowSym}
            rowSym={rowSym}
            i={i}
            n={n}
            matrix={matrix}
            hover={hover}
            setHover={setHover}
            color={color}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-mono text-faint">
          <span>ρ 0.0</span>
          <div
            className="h-2 w-36 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, rgba(96,140,200,0.25), rgba(167,139,250,0.55), rgba(94,234,212,0.9))",
            }}
          />
          <span>1.0</span>
        </div>
        <motion.div
          key={hoverInfo ? `${hoverInfo.a}-${hoverInfo.b}` : "none"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="h-5 font-mono text-[12px] text-mute"
        >
          {hoverInfo && (
            <>
              <span className="text-ink">{hoverInfo.a}</span>
              {" × "}
              <span className="text-ink">{hoverInfo.b}</span>
              {"  ρ = "}
              <span className="text-mint">{hoverInfo.rho.toFixed(2)}</span>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Row({
  rowSym,
  i,
  n,
  matrix,
  hover,
  setHover,
  color,
}: {
  rowSym: string;
  i: number;
  n: number;
  matrix: number[][];
  hover: { i: number; j: number } | null;
  setHover: (h: { i: number; j: number } | null) => void;
  color: (rho: number, diag: boolean) => string;
}) {
  // Numbers stay readable up to ~22 holdings; beyond that, hover carries them.
  const showNumbers = n <= 22;
  const fontSize = n <= 12 ? 10 : n <= 16 ? 9 : 8;
  return (
    <>
      <div
        className={`flex items-center justify-end pr-2 font-mono text-[9.5px] tracking-wide transition-colors ${
          hover?.i === i ? "text-mint" : "text-faint"
        }`}
      >
        {rowSym}
      </div>
      {matrix[i].map((rho, j) => {
        const isDiag = i === j;
        const inCross = hover ? hover.i === i || hover.j === j : false;
        return (
          <motion.div
            key={j}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.012 * (i + j), duration: 0.3 }}
            onMouseEnter={() => setHover({ i, j })}
            className="relative flex aspect-square items-center justify-center rounded-[4px]"
            style={{
              background: color(rho, isDiag),
              outline:
                hover && hover.i === i && hover.j === j
                  ? "1.5px solid rgba(231,236,244,0.8)"
                  : "none",
              filter: hover && !inCross ? "saturate(0.4) brightness(0.6)" : "none",
              transition: "filter 150ms ease",
            }}
            title={isDiag ? rowSym : `ρ ${rho.toFixed(2)}`}
          >
            {showNumbers && !isDiag && (
              <span
                className="pointer-events-none select-none font-mono tnum"
                style={{
                  fontSize,
                  // bright mint cells need dark text; cool/dim cells need light
                  color: rho > 0.62 ? "rgba(3,16,12,0.85)" : "rgba(231,236,244,0.72)",
                }}
              >
                {rho.toFixed(2).replace(/^0\./, ".")}
              </span>
            )}
          </motion.div>
        );
      })}
    </>
  );
}
