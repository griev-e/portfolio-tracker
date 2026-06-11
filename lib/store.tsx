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
import { buildPortfolio } from "./analytics/build";
import { parsePortfolioCSV } from "./csv";
import { useLiveData } from "./live/useLiveData";
import { SAMPLE_CASH, SAMPLE_CSV } from "./sample";
import type { Portfolio, RawHolding } from "./types";

const STORAGE_KEY = "hlee.portfolio.v1";
/** Pre-rebrand key — migrated on first load, then removed. */
const LEGACY_STORAGE_KEY = "meridian.portfolio.v1";

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
}

interface PortfolioStore {
  /** null until localStorage has been read (avoids hydration flicker). */
  ready: boolean;
  hasData: boolean;
  isDemo: boolean;
  portfolio: Portfolio | null;
  live: LiveStatus;
  importHoldings: (holdings: RawHolding[], cash: number | null) => void;
  loadDemo: () => void;
  setCash: (cash: number) => void;
  clear: () => void;
}

const Ctx = createContext<PortfolioStore | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          localStorage.setItem(STORAGE_KEY, raw);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
      if (raw) setStored(JSON.parse(raw) as Stored);
    } catch {
      // corrupted state — start fresh
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: Stored | null) => {
    setStored(next);
    try {
      if (next === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode) — keep in memory
    }
  }, []);

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

  const portfolio = useMemo(
    () =>
      stored && stored.holdings.length > 0
        ? buildPortfolio(stored.holdings, stored.cash, stored.asOf, {
            quotes: liveData.quotes,
            patches: liveData.patches,
          })
        : null,
    [stored, liveData.quotes, liveData.patches]
  );

  const live = useMemo<LiveStatus>(
    () => ({
      quotesAt: liveData.quotesAt,
      fundamentalsAt: liveData.fundamentalsAt,
      degraded: liveData.degraded,
      livePriceCount:
        portfolio?.positions.filter((p) => p.isLivePrice).length ?? 0,
    }),
    [liveData.quotesAt, liveData.fundamentalsAt, liveData.degraded, portfolio]
  );

  const value = useMemo<PortfolioStore>(
    () => ({
      ready,
      hasData: !!portfolio,
      isDemo: !!stored?.isDemo,
      portfolio,
      live,
      importHoldings,
      loadDemo,
      setCash,
      clear,
    }),
    [ready, portfolio, stored?.isDemo, live, importHoldings, loadDemo, setCash, clear]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePortfolio(): PortfolioStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePortfolio must be used inside PortfolioProvider");
  return ctx;
}
