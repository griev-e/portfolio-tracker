"use client";

import { useState } from "react";
import { institutionDomain } from "@/lib/theta/data";

/**
 * Brand logo for a financial institution (Clearbit's keyless logo CDN, by
 * domain), falling back to the accent-colored monogram chip when there's no
 * domain or no logo. The domain comes from the synced account where available,
 * otherwise it's guessed from the institution name (`institutionDomain`).
 *
 * Mirrors `components/ui/TickerLogo.tsx` — same try-remote-then-monogram shape,
 * so a missing logo degrades gracefully and never blocks the row.
 */
export function InstitutionLogo({
  institution,
  domain,
  accent,
  size = 36,
}: {
  institution: string;
  domain?: string;
  accent: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = (domain || institutionDomain(institution)).trim();

  if (!resolved || failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-medium"
        style={{
          width: size,
          height: size,
          background: `color-mix(in srgb, ${accent} 14%, transparent)`,
          color: accent,
        }}
      >
        {institution.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny remote logos; next/image gains nothing here
    <img
      src={`https://logo.clearbit.com/${encodeURIComponent(resolved)}`}
      alt={`${institution} logo`}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-lg border border-edge bg-white object-contain p-0.5"
      style={{ width: size, height: size }}
    />
  );
}
