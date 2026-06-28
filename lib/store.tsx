"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { buildPortfolio, mergeAllFundamentals } from "./analytics/build";
import { parsePortfolioCSV } from "./csv";
import { primeLiveCMA } from "./live/cma";
import { useLiveData } from "./live/useLiveData";
import { getServerState, putPortfolio } from "./persist";
import { SAMPLE_CASH, SAMPLE_CSV } from "./sample";
import type { Portfolio, RawHolding } from "./types";

const STORAGE_KEY = "alpha.portfolio.v1";
/** Pre-rebrand keys — migrated on first load, then removed. */
const LEGACY_STORAGE_KEYS = [
  "grieve.portfolio.v1",
  "sanctum.portfolio.v1",
  "hlee.portfolio.v1",
  "meridian.portfolio.v1",
];

interface Stored {
  holdings: RawHolding[];
  cash: number;
  asOf: string;
  isDemo?: boolean;
}

export interface LiveStatus {
  /** ISO time of the last successful quote refresh, null = none yet. */
  quotesAt: string | null;
  fundamentalsAt: string | null;
  /** Last quote fetch failed — running on imported prices / snapshot. */
  degraded: boolean;
  /** How many positions are currently repriced live. */
  livePriceCount: number;
  /** True while a manual refresh is in flight. */
  refreshing: boolean;
}

/**
 * Portfolio data — changes only when the book itself moves (import, cash edit,
 * or a real price tick that rebuilds the portfolio). Deliberately split from
 * `LiveStatus`: the live status carries a `quotesAt` timestamp that updates on
 * every 60s poll even when no price moved, so folding it in here would re-render
 * every analytics page once a minute for nothing.
 */
interface PortfolioData {
  /** null until localStorage has been read (avoids hydration flicker). */
  ready: boolean;
  hasData: boolean;
  isDemo: boolean;
  portfolio: Portfolio | null;
}

/** Stable action handles — identity survives price ticks. */
interface PortfolioActions {
  importHoldings: (holdings: RawHolding[], cash: number | null) => void;
  loadDemo: () => void;
  setCash: (cash: number) => void;
  clear: () => void;
  /** Force-refetch live quotes + fundamentals, bypassing caches. */
  refreshLive: () => Promise<void>;
}

const DataCtx = createContext<PortfolioData | null>(null);
const LiveCtx = createContext<LiveStatus | null>(null);
const ActionsCtx = createContext<PortfolioActions | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { enabled, status } = useAuth();
  // Server-backed when real auth is on and a user is signed in; otherwise the
  // original localStorage model (open mode / not signed in).
  const serverMode = enabled && status === "authenticated";

  const [stored, setStored] = useState<Stored | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    primeLiveCMA();
  }, []);

  // Hydrate from the right backend. In server mode we read ONLY from the server
  // (never the shared-browser localStorage), so one user's portfolio can't leak
  // to the next person who signs in on the same machine.
  useEffect(() => {
    if (!enabled) {
      try {
        let raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          for (const legacy of LEGACY_STORAGE_KEYS) {
            const old = localStorage.getItem(legacy);
            if (old && !raw) {
              raw = old;
              localStorage.setItem(STORAGE_KEY, old);
            }
            localStorage.removeItem(legacy);
          }
        }
        setStored(raw ? (JSON.parse(raw) as Stored) : null);
      } catch {
        setStored(null); // corrupted state — start fresh
      }
      setReady(true);
      return;
    }
    if (status === "loading") {
      setReady(false);
      return;
    }
    if (status === "authenticated") {
      let alive = true;
      setReady(false);
      getServerState().then((s) => {
        if (!alive) return;
        setStored((s?.portfolio as Stored | null) ?? null);
        setReady(true);
      });
      return () => {
        alive = false;
      };
    }
    // enabled but unauthenticated (middleware normally prevents reaching here)
    setStored(null);
    setReady(true);
  }, [enabled, status]);

  const persist = useCallback(
    (next: Stored | null) => {
      setStored(next);
      if (serverMode) {
        void putPortfolio(next);
        return;
      }
      try {
        if (next === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable (private mode) — keep in memory
      }
    },
    [serverMode]
  );

  const importHoldings = useCallback(
    (holdings: RawHolding[], cash: number | null) => {
      persist({
        holdings,
        cash: cash ?? stored?.cash ?? 0,
        asOf: new Date().toISOString(),
        isDemo: false,
      });
    },
    [persist, stored?.cash]
  );

  const loadDemo = useCallback(() => {
    const { holdings } = parsePortfolioCSV(SAMPLE_CSV);
    persist({
      holdings,
      cash: SAMPLE_CASH,
      asOf: new Date().toISOString(),
      isDemo: true,
    });
  }, [persist]);

  const setCash = useCallback(
    (cash: number) => {
      if (!stored) return;
      persist({ ...stored, cash });
    },
    [persist, stored]
  );

  const clear = useCallback(() => persist(null), [persist]);

  const symbols = useMemo(
    () => stored?.holdings.map((h) => h.symbol) ?? [],
    [stored]
  );
  const liveData = useLiveData(symbols);

  // Fundamentals merge keyed only on the symbol set + patches (slow-moving), so
  // a 60s quote tick reprices without re-running the field-by-field merge.
  const fundamentals = useMemo(
    () => mergeAllFundamentals(symbols, liveData.patches),
    [symbols, liveData.patches]
  );

  const portfolio = useMemo(
    () =>
      stored && stored.holdings.length > 0
        ? buildPortfolio(stored.holdings, stored.cash, stored.asOf, {
            quotes: liveData.quotes,
            patches: liveData.patches,
            fundamentals,
          })
        : null,
    [stored, liveData.quotes, liveData.patches, fundamentals]
  );

  const live = useMemo<LiveStatus>(
    () => ({
      quotesAt: liveData.quotesAt,
      fundamentalsAt: liveData.fundamentalsAt,
      degraded: liveData.degraded,
      livePriceCount:
        portfolio?.positions.filter((p) => p.isLivePrice).length ?? 0,
      refreshing: liveData.refreshing,
    }),
    [
      liveData.quotesAt,
      liveData.fundamentalsAt,
      liveData.degraded,
      liveData.refreshing,
      portfolio,
    ]
  );

  const data = useMemo<PortfolioData>(
    () => ({
      ready,
      hasData: !!portfolio,
      isDemo: !!stored?.isDemo,
      portfolio,
    }),
    [ready, portfolio, stored?.isDemo]
  );

  const actions = useMemo<PortfolioActions>(
    () => ({
      importHoldings,
      loadDemo,
      setCash,
      clear,
      refreshLive: liveData.refresh,
    }),
    [importHoldings, loadDemo, setCash, clear, liveData.refresh]
  );

  // Three nested providers, narrowest churn innermost: `live` ticks every poll,
  // `data` only on a real book change, `actions` ~never. Consumers subscribe to
  // just the slice they need (usePortfolio / useLiveStatus / usePortfolioActions).
  return (
    <ActionsCtx.Provider value={actions}>
      <DataCtx.Provider value={data}>
        <LiveCtx.Provider value={live}>{children}</LiveCtx.Provider>
      </DataCtx.Provider>
    </ActionsCtx.Provider>
  );
}

export function usePortfolio(): PortfolioData {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error("usePortfolio must be used inside PortfolioProvider");
  return ctx;
}

export function useLiveStatus(): LiveStatus {
  const ctx = useContext(LiveCtx);
  if (!ctx) throw new Error("useLiveStatus must be used inside PortfolioProvider");
  return ctx;
}

export function usePortfolioActions(): PortfolioActions {
  const ctx = useContext(ActionsCtx);
  if (!ctx)
    throw new Error("usePortfolioActions must be used inside PortfolioProvider");
  return ctx;
}
