"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_WIDTH = 180;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 240;

/**
 * Persisted, drag-to-resize sidebar width. Reads/writes localStorage under
 * `storageKey` so each app (alpha/theta) remembers its own width across
 * reloads. `onMouseDown` goes on a thin handle at the sidebar's right edge.
 */
export function useSidebarWidth(storageKey: string) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (saved && saved >= MIN_WIDTH && saved <= MAX_WIDTH) setWidth(saved);
    } catch {
      /* private mode — fall back to the default width */
    }
  }, [storageKey]);

  useEffect(() => {
    if (!dragging) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (e: MouseEvent) => {
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth.current + (e.clientX - startX.current))
      );
      setWidth(next);
    };
    const onUp = () => {
      setDragging(false);
      setWidth((w) => {
        try {
          localStorage.setItem(storageKey, String(w));
        } catch {
          /* private mode — width just won't persist */
        }
        return w;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, storageKey]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startX.current = e.clientX;
      startWidth.current = width;
      setDragging(true);
    },
    [width]
  );

  return { width, dragging, onMouseDown };
}
