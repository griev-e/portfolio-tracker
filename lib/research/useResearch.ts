"use client";

import { useEffect, useRef, useState } from "react";
import { fromPatch, mergeFundamentals } from "@/lib/live/merge";
import type {
  FundamentalsResponse,
  LiveQuote,
  QuotesResponse,
} from "@/lib/live/types";
import type { Fundamentals } from "@/lib/types";
import type { HistoryRange, HistorySeries } from "./types";

export interface ResearchTarget {
  symbol: string | null;
  loading: boolean;
  /** No live quote and no live fundamentals — the provider knows nothing. */
  notFound: boolean;
  quote: LiveQuote | null;
  fundamentals: Fundamentals | null;
  /** A live fundamentals patch was returned for the symbol. */
  live: boolean;
  /** Timestamp of the live quote, if any. */
  asOf: string | null;
}

const QUOTE_POLL_MS = 60_000;

function emptyTarget(symbol: string | null): ResearchTarget {
  return {
    symbol,
    loading: symbol !== null,
    notFound: false,
    quote: null,
    fundamentals: null,
    live: false,
    asOf: null,
  };
}

/**
 * Loads a single research target: live quote + fundamentals for any ticker (not
 * just holdings), entirely from the live provider — there is no bundled
 * snapshot. The quote re-polls every 60s while the tab is visible; fundamentals
 * are fetched once per symbol.
 */
export function useResearchTarget(symbol: string | null): ResearchTarget {
  const [state, setState] = useState<ResearchTarget>(() => emptyTarget(symbol));
  const symRef = useRef(symbol);
  symRef.current = symbol;

  useEffect(() => {
    if (!symbol) {
      setState(emptyTarget(null));
      return;
    }

    let cancelled = false;
    setState(emptyTarget(symbol));

    const loadQuote = async (): Promise<{
      quote: LiveQuote | null;
      asOf: string | null;
    }> => {
      try {
        const res = await fetch(`/api/quotes?symbols=${symbol}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as QuotesResponse;
        return { quote: data.quotes[symbol] ?? null, asOf: data.asOf };
      } catch {
        return { quote: null, asOf: null };
      }
    };

    const loadFundamentals = async () => {
      try {
        const res = await fetch(`/api/fundamentals?symbols=${symbol}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as FundamentalsResponse;
        return data.patches[symbol];
      } catch {
        return undefined;
      }
    };

    (async () => {
      const [q, patch] = await Promise.all([loadQuote(), loadFundamentals()]);
      if (cancelled || symRef.current !== symbol) return;
      const merged = mergeFundamentals(null, patch);
      // A real, tradeable security (we have a live quote) whose fundamentals
      // fetch came back completely empty still gets a fully-estimated profile
      // for display — every field traces through provenance as "fallback", so
      // the page shows a number instead of a dead end, never silently passing
      // it off as live. This is display-only: it never feeds the portfolio's
      // risk/correlation/quality math, which still treats the holding as a
      // genuine no-data coverage gap.
      const fundamentals =
        merged ?? (q.quote ? fromPatch({ symbol, asOf: new Date().toISOString() }) : null);
      setState({
        symbol,
        loading: false,
        notFound: !q.quote && !merged,
        quote: q.quote,
        fundamentals,
        live: patch !== undefined,
        asOf: q.asOf,
      });
    })();

    const interval = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const q = await loadQuote();
      if (cancelled || symRef.current !== symbol || !q.quote) return;
      setState((prev) =>
        prev.symbol === symbol
          ? { ...prev, quote: q.quote, asOf: q.asOf }
          : prev
      );
    }, QUOTE_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol]);

  return state;
}

/**
 * Price history for one symbol/range. Keeps the previous series visible across
 * range switches so the chart never unmounts mid-transition.
 */
export function usePriceHistory(
  symbol: string | null,
  range: HistoryRange
): { data: HistorySeries | null; loading: boolean } {
  const [data, setData] = useState<HistorySeries | null>(null);
  const [loading, setLoading] = useState(false);
  const keyRef = useRef("");

  // Clear stale data when the symbol changes (but keep it across range swaps).
  useEffect(() => {
    setData(null);
  }, [symbol]);

  useEffect(() => {
    if (!symbol) {
      setData(null);
      return;
    }
    const key = `${symbol}:${range}`;
    keyRef.current = key;
    setLoading(true);
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/history?symbol=${symbol}&range=${range}`);
        if (!res.ok) throw new Error();
        const series = (await res.json()) as HistorySeries;
        if (cancelled || keyRef.current !== key) return;
        setData(series);
      } catch {
        if (!cancelled && keyRef.current === key) setData(null);
      } finally {
        if (!cancelled && keyRef.current === key) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  return { data, loading };
}
