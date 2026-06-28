"use client";

import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` of quiet.
 * Use it to coalesce rapid input (slider drags, typing) before it feeds an
 * expensive computation, so the work runs once on the settled value instead of
 * on every intermediate tick. The first value passes through on mount with the
 * normal delay; if you need the initial render to be immediate, seed the
 * computation from the raw value on first paint.
 */
export function useDebouncedValue<T>(value: T, delayMs = 120): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
