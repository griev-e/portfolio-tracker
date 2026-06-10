"use client";

import { useEffect, useMemo, useState } from "react";
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
}

const QUOTE_POLL_MS = 60_000;

/**
 * Polls live quotes (60s, only while the tab is visible) and fetches the
 * fundamentals overlay once per symbol set. Failures degrade silently to
 * imported prices and the bundled snapshot.
 */
export function useLiveData(symbols: string[]): LiveData {
  // Sorted key keeps the CDN cache hot and effects stable.
  const key = useMemo(() => [...symbols].sort().join(","), [symbols]);

  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [quotesAt, setQuotesAt] = useState<string | null>(null);
  const [patches, setPatches] = useState<Record<string, FundamentalsPatch>>({});
  const [fundamentalsAt, setFundamentalsAt] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    if (!key) {
      setQuotes({});
      setQuotesAt(null);
      setPatches({});
      setFundamentalsAt(null);
      return;
    }
    let stopped = false;

    const fetchQuotes = async () => {
      try {
        const res = await fetch(`/api/quotes?symbols=${key}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as QuotesResponse;
        if (!stopped) {
          setQuotes(data.quotes);
          setQuotesAt(data.asOf);
          setDegraded(false);
        }
      } catch {
        if (!stopped) setDegraded(true);
      }
    };

    const fetchFundamentals = async () => {
      try {
        const res = await fetch(`/api/fundamentals?symbols=${key}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as FundamentalsResponse;
        if (!stopped) {
          setPatches(data.patches);
          setFundamentalsAt(data.asOf);
        }
      } catch {
        // snapshot fallback — nothing to do
      }
    };

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
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);

  return { quotes, quotesAt, patches, fundamentalsAt, degraded };
}
