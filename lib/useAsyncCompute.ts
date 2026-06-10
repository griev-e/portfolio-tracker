"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Runs an expensive synchronous computation off the critical render path:
 * the UI (sliders, overlay) paints first, then the work happens on the next
 * tick. Keeps the previous value while recomputing so charts don't unmount.
 */
export function useAsyncCompute<T>(
  compute: () => T | null,
  deps: unknown[]
): { value: T | null; pending: boolean } {
  const [value, setValue] = useState<T | null>(null);
  const [pending, setPending] = useState(true);
  const computeRef = useRef(compute);
  computeRef.current = compute;

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    // ~one frame of breathing room so the interaction feels instant
    const t = setTimeout(() => {
      const v = computeRef.current();
      if (!cancelled) {
        setValue(v);
        setPending(false);
      }
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { value, pending };
}
