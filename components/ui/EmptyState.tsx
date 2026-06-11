"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Sigil } from "@/components/shell/AppShell";
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
      <div className="mb-4 flex justify-center opacity-90">
        <Sigil size={44} id="egrad" />
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">
        No portfolio loaded
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-mute">
        {page} needs holdings to analyze. Import your CSV or load the demo
        portfolio to explore.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link href="/import" className="btn-primary">
          Import CSV
        </Link>
        <button onClick={loadDemo} className="btn-secondary">
          Load demo
        </button>
      </div>
    </motion.div>
  );
}
