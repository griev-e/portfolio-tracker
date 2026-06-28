"use client";

import { AnimatePresence, m } from "framer-motion";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { Mark } from "@/components/shell/brand";
import { useTheta } from "@/lib/theta/store";

/** Centered modal dialog — backdrop click + Escape close it. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <m.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <m.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="panel relative z-10 w-full max-w-md p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-[15px] font-medium text-ink">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-md text-mute transition-colors hover:bg-white/[0.06] hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** Labeled text/number input wrapping the global `.field` style. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field ${props.className ?? ""}`} />;
}

export function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className="field cursor-pointer appearance-none pr-8"
      >
        {children}
      </select>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 8"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M1 1l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** A small ghost icon button (trash, edit) revealed on row hover. */
export function IconButton({
  onClick,
  label,
  danger = false,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-mute transition-colors hover:bg-white/[0.06] ${
        danger ? "hover:text-neg" : "hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6M6.5 6l.6 9.5A1.5 1.5 0 0 0 8.6 17h2.8a1.5 1.5 0 0 0 1.5-1.5L13.5 6" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

/** Small pill button used for header actions ("Add", "Mark paid"). */
export function ActionButton({
  onClick,
  children,
  variant = "secondary",
}: {
  onClick: () => void;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors ${
        variant === "primary"
          ? "bg-ink text-black hover:bg-white"
          : "border border-edge2 text-mute hover:border-white/30 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** Shown on theta pages when the ledger is empty (after Clear). */
export function ThetaEmpty({ page }: { page: string }) {
  const { loadSample } = useTheta();
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="panel mx-auto mt-16 max-w-md px-8 py-10 text-center"
    >
      <div className="mb-4 flex justify-center opacity-90">
        <Mark kind="theta" size={44} />
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">No data yet</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-mute">
        {page} needs accounts and transactions. Load the sample ledger to explore,
        or import your own.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button onClick={loadSample} className="btn-primary">
          Load sample
        </button>
        <Link href="/theta/import" className="btn-secondary">
          Import
        </Link>
      </div>
    </m.div>
  );
}
