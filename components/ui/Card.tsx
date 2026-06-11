"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Glass panel with a staggered rise-in. Use `i` to order siblings. */
export function Card({
  children,
  className = "",
  i = 0,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  i?: number;
  hover?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className={`panel ${hover ? "panel-hover" : ""} ${className}`}
    >
      {children}
    </motion.section>
  );
}

export function CardHeader({
  eyebrow,
  title,
  right,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div>
        {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
        <h2 className="font-display text-[14px] font-medium text-ink">
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}
