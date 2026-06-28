"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Shared brand primitives for the two-app portal.
 *
 * `alpha` (portfolio analytics) and `theta` (personal finance) are sister
 * surfaces that share one dark, institutional aesthetic. Their wordmarks are
 * the Greek letters set in the same serif so they read as a family; each app
 * carries a single signature accent — mint for alpha, iris for theta — used
 * sparingly the way the rest of the UI uses color.
 */

export type AppKind = "alpha" | "theta";

export const APP_HOME: Record<AppKind, string> = {
  alpha: "/",
  theta: "/theta",
};

export const APP_META: Record<
  AppKind,
  {
    glyph: string;
    name: string;
    phonetic: string;
    tagline: string;
    definition: string;
  }
> = {
  alpha: {
    glyph: "α",
    name: "alpha",
    phonetic: "/ăl′fə/",
    tagline: "portfolio analytics",
    definition: "a measure of risk-adjusted excess return",
  },
  theta: {
    glyph: "θ",
    name: "theta",
    phonetic: "/THĀ′tə/",
    tagline: "personal finance",
    definition: "a measure of time's impact on value",
  },
};

/** The cursive serif glyph that anchors each app. */
export function Mark({ kind, size = 26 }: { kind: AppKind; size?: number }) {
  // α sits a touch high; θ is a round lowercase form sized a hair smaller to
  // balance against α at the same box. Because both glyphs are vertically
  // centered (dominant-baseline central), the smaller θ would otherwise carry a
  // higher baseline than α — so it's nudged further down to sit on α's line.
  const isAlpha = kind === "alpha";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <text
        x="16"
        y={isAlpha ? 12.8 : 15}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontSize={isAlpha ? 30 : 26}
      >
        {APP_META[kind].glyph}
      </text>
    </svg>
  );
}

/** Back-compat alias: the original app sigil is alpha's mark. */
export function Sigil({ size = 26 }: { size?: number }) {
  return <Mark kind="alpha" size={size} />;
}

/**
 * The app title, doubling as the switcher: the active app's name in `ink`,
 * the sister app dimmed and lowercase as a quiet link, separated by a " / ".
 * Replaces the standalone α ⇄ Δ segmented control — the switch lives right
 * where the title already sits instead of a separate row.
 */
export function AppTitle({ active }: { active: AppKind }) {
  return (
    <div className="flex items-center gap-1.5 text-[14px] font-medium leading-none">
      {(["alpha", "theta"] as const).map((kind, i) => {
        const on = kind === active;
        return (
          <span key={kind} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-faint">/</span>}
            {on ? (
              <span className="text-ink">{kind}</span>
            ) : (
              <Link
                href={APP_HOME[kind]}
                aria-label={`Switch to ${kind}`}
                className="text-faint transition-colors hover:text-ink"
              >
                {kind}
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Sign out of the current account and return to the portal. Only shown when
 * accounts are enabled (AUTH_SECRET set) — in open mode there's no session to
 * end, so it renders nothing.
 */
export function SignOutButton({ className = "" }: { className?: string }) {
  const { enabled } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          // Clear the session without NextAuth's own redirect; we navigate
          // ourselves so middleware re-evaluates from a clean slate.
          await signOut({ redirect: false });
        } finally {
          window.location.href = "/lock";
        }
      }}
      disabled={busy}
      title="Sign out"
      aria-label="Sign out"
      className={`flex h-7 w-7 items-center justify-center rounded-md text-mute transition-colors hover:bg-white/[0.06] hover:text-ink disabled:pointer-events-none ${className}`}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 3H4.5A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17H8" />
        <path d="M13 6l4 4-4 4" />
        <path d="M17 10H7.5" />
      </svg>
    </button>
  );
}

/**
 * The signed-in account, shown in the sidebar footer above the app switcher.
 * Renders nothing in open mode or before the session resolves.
 */
export function AccountChip({ className = "" }: { className?: string }) {
  const { enabled, status, name } = useAuth();
  if (!enabled || status !== "authenticated" || !name) return null;
  return (
    <div
      className={`flex items-center gap-1.5 text-[11px] text-faint ${className}`}
      title={`Signed in as ${name}`}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <circle cx="10" cy="6.5" r="3.2" />
        <path d="M4 16.5a6 6 0 0 1 12 0" />
      </svg>
      <span className="truncate">{name}</span>
    </div>
  );
}
