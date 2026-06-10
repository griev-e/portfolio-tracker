"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePortfolio } from "@/lib/store";

/** Shown on analytics pages before any portfolio exists. */
export function EmptyState({ page }: { page: string }) {
  const { loadDemo, ready } = usePortfolio();
  if (!ready) return null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="panel mx-auto mt-16 max-w-md px-8 py-10 text-center"
    >
      <svg
        width="44"
        height="44"
        viewBox="0 0 28 28"
        fill="none"
        className="mx-auto mb-4 opacity-90"
      >
        <circle cx="14" cy="14" r="12.5" stroke="url(#egrad)" strokeWidth="1.2" />
        <path
          d="M7.5 19 V9.5 L14 15.5 L20.5 9.5 V19"
          stroke="url(#egrad)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="egrad" x1="0" y1="0" x2="28" y2="28">
            <stop stopColor="#5EEAD4" />
            <stop offset="1" stopColor="#A78BFA" />
          </linearGradient>
        </defs>
      </svg>
      <h2 className="font-display text-lg font-semibold text-ink">
        No portfolio loaded
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-mute">
        {page} needs holdings to analyze. Import your CSV or load the demo
        portfolio to explore.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link
          href="/import"
          className="rounded-lg bg-mint/15 border border-mint/30 px-4 py-2 text-[13px] font-medium text-mint transition hover:bg-mint/25"
        >
          Import CSV
        </Link>
        <button
          onClick={loadDemo}
          className="rounded-lg border border-edge px-4 py-2 text-[13px] text-mute transition hover:text-ink hover:border-edge2"
        >
          Load demo
        </button>
      </div>
    </motion.div>
  );
}
