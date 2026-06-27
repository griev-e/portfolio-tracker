"use client";

import { motion } from "framer-motion";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Shared brand primitives for the two-app portal.
 *
 * `alpha` (portfolio analytics) and `delta` (personal finance) are sister
 * surfaces that share one dark, institutional aesthetic. Their wordmarks are
 * the Greek letters set in the same serif so they read as a family; each app
 * carries a single signature accent — mint for alpha, iris for delta — used
 * sparingly the way the rest of the UI uses color.
 */

export type AppKind = "alpha" | "delta";

export const APP_ACCENT: Record<AppKind, string> = {
  alpha: "var(--color-mint)", // #5eead4
  delta: "var(--color-vio)", // #a78bfa
};

/** Raw hex of each accent, for places that can't take a CSS var (canvas, etc). */
export const APP_ACCENT_HEX: Record<AppKind, string> = {
  alpha: "#5eead4",
  delta: "#a78bfa",
};

export const APP_HOME: Record<AppKind, string> = {
  alpha: "/",
  delta: "/delta",
};

export const APP_META: Record<
  AppKind,
  { glyph: string; name: string; phonetic: string; tagline: string }
> = {
  alpha: {
    glyph: "α",
    name: "alpha",
    phonetic: "/ăl′fə/",
    tagline: "portfolio analytics",
  },
  delta: {
    glyph: "Δ",
    name: "delta",
    phonetic: "/dĕl′tə/",
    tagline: "personal finance",
  },
};

/** The cursive serif glyph that anchors each app. */
export function Mark({ kind, size = 26 }: { kind: AppKind; size?: number }) {
  // α sits a touch high; Δ (uppercase) is heavier, so it's nudged down and
  // sized a hair smaller to balance against α at the same box.
  const isAlpha = kind === "alpha";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <text
        x="16"
        y={isAlpha ? 12.8 : 13.4}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontSize={isAlpha ? 30 : 25}
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
 * The always-available portal: a compact α ⇄ Δ segmented control. The active
 * app is a filled pill (a shared `layoutId` slides it between the two when you
 * cross over), the other is a quiet link into the sister app.
 */
export function AppSwitcher({ active }: { active: AppKind }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-edge bg-white/[0.03] p-0.5">
      {(["alpha", "delta"] as const).map((kind) => {
        const on = kind === active;
        const accent = APP_ACCENT[kind];
        return (
          <Link
            key={kind}
            href={APP_HOME[kind]}
            aria-label={`Switch to ${kind}`}
            aria-current={on ? "page" : undefined}
            className={`relative flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12px] transition-colors duration-150 ${
              on ? "text-ink" : "text-faint hover:text-ink"
            }`}
          >
            {on && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 rounded-[7px] bg-white/[0.07]"
                style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 22%, transparent)` }}
              />
            )}
            <span
              className="relative z-10 font-serif text-[15px] italic leading-none"
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                color: on ? accent : undefined,
              }}
            >
              {APP_META[kind].glyph}
            </span>
            <span className="relative z-10 lowercase tracking-wide">
              {APP_META[kind].name}
            </span>
          </Link>
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
