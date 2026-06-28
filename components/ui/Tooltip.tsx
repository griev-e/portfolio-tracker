"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type Coords = { top: number; left: number; placement: "top" | "bottom" };

/**
 * Hover-reveal explanation box. Wraps any element; when the pointer rests over
 * it (or it receives keyboard focus) a floating panel describes the underlying
 * concept. Rendered through a portal so it never clips inside tables or
 * overflow-hidden cards. No "?" cursor — the trigger keeps its normal cursor
 * and only gains a faint dotted underline so it reads as explainable.
 */
export function Tooltip({
  children,
  content,
  className = "",
  maxWidth = 260,
  underline = true,
}: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  maxWidth?: number;
  /** Faint dotted underline marking the trigger as explainable. */
  underline?: boolean;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const box = boxRef.current;
    const boxH = box?.offsetHeight ?? 64;
    const gap = 8;
    const fitsAbove = r.top - boxH - gap > 8;
    const placement: "top" | "bottom" = fitsAbove ? "top" : "bottom";
    const top = placement === "top" ? r.top - gap : r.bottom + gap;
    // Clamp horizontally so the (translateX -50%) box stays on screen.
    const half = maxWidth / 2;
    const left = Math.min(
      Math.max(r.left + r.width / 2, half + 8),
      window.innerWidth - half - 8,
    );
    setCoords({ top, left, placement });
  }, [maxWidth]);

  // Re-measure once the box has rendered (so height-aware placement is correct).
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  const show = () => {
    place();
    setOpen(true);
  };
  const hide = () => setOpen(false);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        className={`inline-flex items-center outline-none ${
          underline
            ? "underline decoration-dotted decoration-white/25 underline-offset-[3px]"
            : ""
        } ${className}`}
      >
        {children}
      </span>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <m.div
                ref={boxRef}
                initial={{ opacity: 0, y: coords.placement === "top" ? 4 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: coords.placement === "top" ? 4 : -4 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  maxWidth,
                  transform: `translate(-50%, ${
                    coords.placement === "top" ? "-100%" : "0"
                  })`,
                  zIndex: 9999,
                  pointerEvents: "none",
                }}
                className="rounded-lg border border-edge2 bg-[#0d0d0d] px-3 py-2 text-[11.5px] leading-snug text-mute shadow-[0_8px_28px_-6px_rgba(0,0,0,0.85)]"
              >
                {content}
              </m.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
