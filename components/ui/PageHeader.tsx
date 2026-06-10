"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mb-7 flex flex-wrap items-end justify-between gap-4"
    >
      <div>
        <div className="eyebrow mb-1.5">{eyebrow}</div>
        <h1 className="font-display text-[26px] sm:text-[30px] font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-mute">
            {description}
          </p>
        )}
      </div>
      {right}
    </motion.div>
  );
}
