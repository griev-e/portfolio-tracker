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
import {
  ASSUMPTION_PRESETS,
  DEFAULT_ASSUMPTIONS,
  cloneAssumptions,
  matchPreset,
  type BenchmarkFundamentalAssumptions,
  type MarketAssumptions,
  type PresetId,
} from "@/lib/data/assumptions";
import { setAssumptions as primeAssumptions } from "@/lib/live/assumptions";

/**
 * Holds the user's market assumptions — the handful of forward inputs with no
 * live quote (equity risk premium, dividend-growth anchor, benchmark
 * profitability & growth). Persisted to `localStorage` as a device-level
 * analytical preference: these are non-sensitive market *views*, not portfolio
 * data, so unlike holdings they are not stored per-account server-side.
 *
 * On every change it pushes the values into the `lib/live/assumptions`
 * singleton so the pure analytics pick them up, and bumps a `version` counter
 * that pages include in their compute keys to trigger a recompute.
 */

const STORAGE_KEY = "alpha.assumptions.v1";

export type FieldPath =
  | { scope: "scalar"; key: "equityRiskPremium" | "dividendGrowth" }
  | { scope: "index"; index: "spx" | "ndx"; key: keyof BenchmarkFundamentalAssumptions };

interface AssumptionsCtx {
  assumptions: MarketAssumptions;
  /** The matched preset, or null when the user has customized any value. */
  preset: PresetId | null;
  /** Increments on every change — include in analytics compute keys. */
  version: number;
  setField: (path: FieldPath, value: number) => void;
  applyPreset: (id: PresetId) => void;
  reset: () => void;
}

const Ctx = createContext<AssumptionsCtx | null>(null);

function load(): MarketAssumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ASSUMPTIONS;
    const parsed = JSON.parse(raw) as Partial<MarketAssumptions>;
    // Shallow-merge over defaults so a future added field can't read undefined.
    return {
      equityRiskPremium:
        parsed.equityRiskPremium ?? DEFAULT_ASSUMPTIONS.equityRiskPremium,
      dividendGrowth: parsed.dividendGrowth ?? DEFAULT_ASSUMPTIONS.dividendGrowth,
      spx: { ...DEFAULT_ASSUMPTIONS.spx, ...(parsed.spx ?? {}) },
      ndx: { ...DEFAULT_ASSUMPTIONS.ndx, ...(parsed.ndx ?? {}) },
    };
  } catch {
    return DEFAULT_ASSUMPTIONS;
  }
}

export function AssumptionsProvider({ children }: { children: ReactNode }) {
  const [assumptions, setState] = useState<MarketAssumptions>(DEFAULT_ASSUMPTIONS);
  const [version, setVersion] = useState(0);

  // Hydrate from localStorage after mount (avoids SSR/client mismatch).
  useEffect(() => {
    const loaded = load();
    primeAssumptions(loaded);
    setState(loaded);
    setVersion((v) => v + 1);
  }, []);

  const commit = useCallback((next: MarketAssumptions) => {
    primeAssumptions(next);
    setState(next);
    setVersion((v) => v + 1);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode) — keep in memory
    }
  }, []);

  const setField = useCallback(
    (path: FieldPath, value: number) => {
      setState((prev) => {
        const next = cloneAssumptions(prev);
        if (path.scope === "scalar") next[path.key] = value;
        else next[path.index][path.key] = value;
        primeAssumptions(next);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      setVersion((v) => v + 1);
    },
    []
  );

  const applyPreset = useCallback(
    (id: PresetId) => {
      const preset = ASSUMPTION_PRESETS.find((p) => p.id === id);
      if (preset) commit(cloneAssumptions(preset.values));
    },
    [commit]
  );

  const reset = useCallback(() => {
    commit(cloneAssumptions(DEFAULT_ASSUMPTIONS));
  }, [commit]);

  const value = useMemo<AssumptionsCtx>(
    () => ({
      assumptions,
      preset: matchPreset(assumptions),
      version,
      setField,
      applyPreset,
      reset,
    }),
    [assumptions, version, setField, applyPreset, reset]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssumptions(): AssumptionsCtx {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useAssumptions must be used inside AssumptionsProvider");
  return ctx;
}
