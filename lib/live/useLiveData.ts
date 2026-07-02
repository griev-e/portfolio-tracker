"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FundamentalsPatch,
  FundamentalsResponse,
  LiveQuote,
  QuotesResponse,
} from "./types";

export interface LiveData {
  quotes: Record<string, LiveQuote>;
  quotesAt: string | null;
  patches: Record<string, FundamentalsPatch>;
  fundamentalsAt: string | null;
  /** True when the last quote fetch failed — UI shows snapshot mode. */
  degraded: boolean;
  /** True while a manual refresh is in flight. */
  refreshing: boolean;
  /** Force-refetch quotes + fundamentals, bypassing every cache layer. */
  refresh: () => Promise<void>;
}

const QUOTE_POLL_MS = 60_000;

/**
 * True when two quote maps carry the same prices — i.e. nothing worth a
 * re-render moved. Compares the meaningful fields (price, prevClose) field by
 * field; the per-quote `asOf` is intentionally ignored (the top-level
 * `quotesAt` still refreshes every poll) so an unchanged tape doesn't churn
 * the portfolio build.
 */
function quotesUnchanged(
  a: Record<string, LiveQuote>,
  b: Record<string, LiveQuote>
): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) {
    const x = a[k];
    const y = b[k];
    if (!y || x.price !== y.price || x.prevClose !== y.prevClose) return false;
  }
  return true;
}

/**
 * Polls live quotes (60s, only while the tab is visible) and fetches the
 * fundamentals overlay once per symbol set. Failures degrade silently to
 * imported prices and the bundled snapshot. `refresh()` is the manual
 * override — it punches through the CDN and server caches.
 */
export function useLiveData(symbols: string[]): LiveData {
  // Sorted key keeps the CDN cache hot and effects stable.
  const key = useMemo(() => [...symbols].sort().join(","), [symbols]);
  const keyRef = useRef(key);
  keyRef.current = key;

  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [quotesAt, setQuotesAt] = useState<string | null>(null);
  const [patches, setPatches] = useState<Record<string, FundamentalsPatch>>({});
  const [fundamentalsAt, setFundamentalsAt] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchQuotes = useCallback(
    async (force = false) => {
      if (!key) return;
      try {
        const res = await fetch(
          `/api/quotes?symbols=${key}${force ? "&fresh=1" : ""}`
        );
        if (!res.ok) throw new Error();
        const data = (await res.json()) as QuotesResponse;
        if (keyRef.current !== key) return; // symbol set changed mid-flight
        // Skip the state update when prices haven't moved (common after
        // hours) — avoids rebuilding the portfolio and re-running
        // animations on every poll. Compare the meaningful fields directly
        // instead of serializing both maps on every poll.
        setQuotes((prev) => (quotesUnchanged(prev, data.quotes) ? prev : data.quotes));
        setQuotesAt(data.asOf);
        setDegraded(false);
      } catch {
        if (keyRef.current === key) setDegraded(true);
      }
    },
    [key]
  );

  const fetchFundamentals = useCallback(
    async (attempt = 0) => {
      if (!key) return;
      try {
        const res = await fetch(`/api/fundamentals?symbols=${key}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as FundamentalsResponse;
        if (keyRef.current !== key) return;
        setPatches(data.patches);
        setFundamentalsAt(data.asOf);
        // A cold server can hit its fetch deadline and return a partial
        // overlay; the fetched symbols are now warm-cached there, so a
        // follow-up finishes the rest. Bounded so a dead provider can't loop.
        if (data.partial && attempt < 3) {
          setTimeout(() => {
            if (keyRef.current === key) void fetchFundamentals(attempt + 1);
          }, 8_000);
        }
      } catch {
        // snapshot fallback — nothing to do
      }
    },
    [key]
  );

  useEffect(() => {
    if (!key) {
      setQuotes({});
      setQuotesAt(null);
      setPatches({});
      setFundamentalsAt(null);
      return;
    }

    fetchQuotes();
    fetchFundamentals();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchQuotes();
    }, QUOTE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchQuotes();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, fetchQuotes, fetchFundamentals]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchQuotes(true), fetchFundamentals()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchQuotes, fetchFundamentals]);

  return {
    quotes,
    quotesAt,
    patches,
    fundamentalsAt,
    degraded,
    refreshing,
    refresh,
  };
}
