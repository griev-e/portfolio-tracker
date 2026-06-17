"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePortfolio } from "@/lib/store";
import { evaluate } from "./engine";
import type { AlertEvent, AlertRule, AlertsStored } from "./types";

const STORAGE_KEY = "grieve.alerts.v1";
/** Pre-rebrand key — migrated on first load, then removed. */
const LEGACY_STORAGE_KEY = "sanctum.alerts.v1";
const MAX_EVENTS = 100;

interface AlertsStore {
  ready: boolean;
  rules: AlertRule[];
  events: AlertEvent[];
  unreadCount: number;
  addRule: (
    rule: Omit<AlertRule, "id" | "createdAt" | "armed" | "enabled" | "lastTriggeredAt">
  ) => void;
  updateRule: (id: string, patch: Partial<AlertRule>) => void;
  deleteRule: (id: string) => void;
  markAllRead: () => void;
  dismissEvent: (id: string) => void;
  clearEvents: () => void;
}

const Ctx = createContext<AlertsStore | null>(null);

/** Must mount inside PortfolioProvider — alerts evaluate against the live book. */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const { portfolio } = usePortfolio();
  const [stored, setStored] = useState<AlertsStored>({
    version: 1,
    rules: [],
    events: [],
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          raw = legacy;
          localStorage.setItem(STORAGE_KEY, legacy);
        }
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
      if (raw) {
        const parsed = JSON.parse(raw) as AlertsStored;
        if (parsed.version === 1) setStored(parsed);
      }
    } catch {
      // corrupted state — start fresh
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: AlertsStored) => {
    setStored(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode) — keep in memory
    }
  }, []);

  // Evaluate on every real portfolio change. buildPortfolio is memoized and
  // useLiveData skips no-op quote updates, so this fires once per actual tick.
  const storedRef = useRef(stored);
  storedRef.current = stored;
  useEffect(() => {
    if (!ready || !portfolio) return;
    const current = storedRef.current;
    const result = evaluate(current.rules, portfolio);
    if (!result.changed) return;
    persist({
      ...current,
      rules: result.rules,
      events: [...result.fired, ...current.events].slice(0, MAX_EVENTS),
    });
  }, [ready, portfolio, persist]);

  const addRule = useCallback<AlertsStore["addRule"]>(
    (rule) => {
      const current = storedRef.current;
      persist({
        ...current,
        rules: [
          ...current.rules,
          {
            ...rule,
            id: crypto.randomUUID(),
            enabled: true,
            armed: true,
            createdAt: new Date().toISOString(),
            lastTriggeredAt: null,
          },
        ],
      });
    },
    [persist]
  );

  const updateRule = useCallback(
    (id: string, patch: Partial<AlertRule>) => {
      const current = storedRef.current;
      persist({
        ...current,
        rules: current.rules.map((r) =>
          r.id === id ? { ...r, ...patch, id: r.id } : r
        ),
      });
    },
    [persist]
  );

  const deleteRule = useCallback(
    (id: string) => {
      const current = storedRef.current;
      persist({
        ...current,
        rules: current.rules.filter((r) => r.id !== id),
        events: current.events.filter((e) => e.ruleId !== id),
      });
    },
    [persist]
  );

  const markAllRead = useCallback(() => {
    const current = storedRef.current;
    if (current.events.every((e) => e.read)) return;
    persist({
      ...current,
      events: current.events.map((e) => (e.read ? e : { ...e, read: true })),
    });
  }, [persist]);

  const dismissEvent = useCallback(
    (id: string) => {
      const current = storedRef.current;
      persist({
        ...current,
        events: current.events.filter((e) => e.id !== id),
      });
    },
    [persist]
  );

  const clearEvents = useCallback(() => {
    persist({ ...storedRef.current, events: [] });
  }, [persist]);

  const value = useMemo<AlertsStore>(
    () => ({
      ready,
      rules: stored.rules,
      events: stored.events,
      unreadCount: stored.events.filter((e) => !e.read).length,
      addRule,
      updateRule,
      deleteRule,
      markAllRead,
      dismissEvent,
      clearEvents,
    }),
    [
      ready,
      stored.rules,
      stored.events,
      addRule,
      updateRule,
      deleteRule,
      markAllRead,
      dismissEvent,
      clearEvents,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAlerts(): AlertsStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAlerts must be used inside AlertsProvider");
  return ctx;
}
