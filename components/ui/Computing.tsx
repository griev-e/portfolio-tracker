"use client";

import { AnimatePresence, motion } from "framer-motion";

/** Overlay shown while a simulation crunches. Parent needs `relative`. */
export function Computing({
  active,
  label = "computing…",
}: {
  active: boolean;
  label?: string;
}) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-[18px] bg-black/55 backdrop-blur-[3px]"
        >
          <svg width="34" height="34" viewBox="0 0 34 34" className="animate-spin" style={{ animationDuration: "0.9s" }}>
            <circle
              cx="17"
              cy="17"
              r="14"
              fill="none"
              stroke="rgba(148,163,184,0.15)"
              strokeWidth="2.5"
            />
            <path
              d="M17 3 A 14 14 0 0 1 31 17"
              fill="none"
              stroke="url(#spinGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="spinGrad" x1="17" y1="3" x2="31" y2="17">
                <stop stopColor="#5EEAD4" />
                <stop offset="1" stopColor="#A78BFA" />
              </linearGradient>
            </defs>
          </svg>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-mute">
            {label}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
