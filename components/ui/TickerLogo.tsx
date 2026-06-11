"use client";

import { useState } from "react";

/**
 * Brand logo for a ticker (Parqet's keyless logo CDN), falling back to the
 * accent-colored monogram chip when no logo exists for the symbol.
 */
export function TickerLogo({
  symbol,
  accent,
  size = 32,
}: {
  symbol: string;
  accent: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-semibold"
        style={{
          width: size,
          height: size,
          background: `color-mix(in srgb, ${accent} 14%, transparent)`,
          color: accent,
        }}
      >
        {symbol.slice(0, 2)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny remote logos; next/image gains nothing here
    <img
      src={`https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbol)}?format=jpg`}
      alt={`${symbol} logo`}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-lg border border-edge object-cover"
      style={{ width: size, height: size }}
    />
  );
}
