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
import { advanceRecurring, deriveDelta, type DeltaView } from "./compute";
import {
  type Account,
  type Budget,
  type Category,
  EMPTY_LEDGER,
  type Goal,
  GOAL_ACCENTS,
  type Ledger,
  type Recurring,
  SAMPLE_LEDGER,
  type Transaction,
} from "./data";

const STORAGE_KEY = "delta.ledger.v1";
const SAMPLE_FLAG = "delta.isSample.v1";

type NewTransaction = Omit<Transaction, "id">;

interface DeltaStore {
  /** false until localStorage has been read (avoids hydration flicker). */
  ready: boolean;
  /** The sample ledger is loaded (vs. the user's own imported/edited data). */
  isSample: boolean;
  ledger: Ledger | null;
  view: DeltaView | null;

  addTransaction: (tx: NewTransaction) => void;
  deleteTransaction: (id: string) => void;
  importTransactions: (txs: NewTransaction[]) => void;

  setBudgetLimit: (category: Category, limit: number) => void;
  addBudget: (category: Category, limit: number) => void;
  removeBudget: (category: Category) => void;

  addGoal: (g: Omit<Goal, "id" | "accent"> & { accent?: string }) => void;
  contributeToGoal: (id: string, amount: number) => void;
  removeGoal: (id: string) => void;

  markRecurringPaid: (id: string) => void;
  removeRecurring: (id: string) => void;

  updateAccountBalance: (id: string, balance: number) => void;
  removeAccount: (id: string) => void;

  loadSample: () => void;
  clear: () => void;
}

const Ctx = createContext<DeltaStore | null>(null);

function uid(prefix: string): string {
  try {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export function DeltaProvider({ children }: { children: ReactNode }) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [ready, setReady] = useState(false);

  // First load: read storage, or auto-seed the sample so delta feels alive.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setLedger(JSON.parse(raw) as Ledger);
        setIsSample(localStorage.getItem(SAMPLE_FLAG) === "1");
      } else {
        setLedger(SAMPLE_LEDGER);
        setIsSample(true);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_LEDGER));
        localStorage.setItem(SAMPLE_FLAG, "1");
      }
    } catch {
      // storage unavailable / corrupt — fall back to the sample in memory
      setLedger(SAMPLE_LEDGER);
      setIsSample(true);
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: Ledger | null, sample: boolean) => {
    setLedger(next);
    setIsSample(sample);
    try {
      if (next === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      localStorage.setItem(SAMPLE_FLAG, sample ? "1" : "0");
    } catch {
      // private mode — keep in memory
    }
  }, []);

  /** Apply a pure update to the ledger; any edit drops the "sample" badge. */
  const mutate = useCallback(
    (fn: (l: Ledger) => Ledger) => {
      setLedger((cur) => {
        const base = cur ?? EMPTY_LEDGER;
        const next = fn(base);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          localStorage.setItem(SAMPLE_FLAG, "0");
        } catch {
          /* keep in memory */
        }
        return next;
      });
      setIsSample(false);
    },
    []
  );

  const addTransaction = useCallback(
    (tx: NewTransaction) =>
      mutate((l) => ({
        ...l,
        transactions: [{ ...tx, id: uid("t") }, ...l.transactions].sort(
          (a, b) => b.date.localeCompare(a.date)
        ),
      })),
    [mutate]
  );

  const deleteTransaction = useCallback(
    (id: string) =>
      mutate((l) => ({
        ...l,
        transactions: l.transactions.filter((t) => t.id !== id),
      })),
    [mutate]
  );

  const importTransactions = useCallback(
    (txs: NewTransaction[]) =>
      mutate((l) => ({
        ...l,
        transactions: txs
          .map((t) => ({ ...t, id: uid("t") }))
          .sort((a, b) => b.date.localeCompare(a.date)),
      })),
    [mutate]
  );

  const setBudgetLimit = useCallback(
    (category: Category, limit: number) =>
      mutate((l) => {
        const exists = l.budgets.some((b) => b.category === category);
        const budgets: Budget[] = exists
          ? l.budgets.map((b) => (b.category === category ? { ...b, limit } : b))
          : [...l.budgets, { category, limit }];
        return { ...l, budgets };
      }),
    [mutate]
  );

  const addBudget = useCallback(
    (category: Category, limit: number) =>
      mutate((l) =>
        l.budgets.some((b) => b.category === category)
          ? { ...l, budgets: l.budgets.map((b) => (b.category === category ? { ...b, limit } : b)) }
          : { ...l, budgets: [...l.budgets, { category, limit }] }
      ),
    [mutate]
  );

  const removeBudget = useCallback(
    (category: Category) =>
      mutate((l) => ({ ...l, budgets: l.budgets.filter((b) => b.category !== category) })),
    [mutate]
  );

  const addGoal = useCallback(
    (g: Omit<Goal, "id" | "accent"> & { accent?: string }) =>
      mutate((l) => ({
        ...l,
        goals: [
          ...l.goals,
          {
            ...g,
            id: uid("g"),
            accent: g.accent ?? GOAL_ACCENTS[l.goals.length % GOAL_ACCENTS.length],
          },
        ],
      })),
    [mutate]
  );

  const contributeToGoal = useCallback(
    (id: string, amount: number) =>
      mutate((l) => ({
        ...l,
        goals: l.goals.map((g) =>
          g.id === id ? { ...g, saved: Math.max(0, g.saved + amount) } : g
        ),
      })),
    [mutate]
  );

  const removeGoal = useCallback(
    (id: string) => mutate((l) => ({ ...l, goals: l.goals.filter((g) => g.id !== id) })),
    [mutate]
  );

  const markRecurringPaid = useCallback(
    (id: string) =>
      mutate((l) => {
        const r = l.recurring.find((x) => x.id === id);
        if (!r) return l;
        const acct =
          l.accounts.find((a) => a.kind === "checking") ?? l.accounts[0];
        const tx: Transaction = {
          id: uid("t"),
          date: today(),
          merchant: r.name,
          category: r.category,
          account: acct?.id ?? "chk",
          amount: -Math.abs(r.amount),
        };
        return {
          ...l,
          transactions: [tx, ...l.transactions].sort((a, b) => b.date.localeCompare(a.date)),
          recurring: l.recurring.map((x) =>
            x.id === id ? { ...x, nextDate: advanceRecurring(x.nextDate, x.cadence) } : x
          ),
        };
      }),
    [mutate]
  );

  const removeRecurring = useCallback(
    (id: string) =>
      mutate((l) => ({ ...l, recurring: l.recurring.filter((r) => r.id !== id) })),
    [mutate]
  );

  const updateAccountBalance = useCallback(
    (id: string, balance: number) =>
      mutate((l) => ({
        ...l,
        accounts: l.accounts.map((a) =>
          a.id === id ? { ...a, balance, trend: [...a.trend.slice(1), balance] } : a
        ) as Account[],
      })),
    [mutate]
  );

  const removeAccount = useCallback(
    (id: string) =>
      mutate((l) => ({ ...l, accounts: l.accounts.filter((a) => a.id !== id) })),
    [mutate]
  );

  const loadSample = useCallback(
    () => persist(JSON.parse(JSON.stringify(SAMPLE_LEDGER)) as Ledger, true),
    [persist]
  );
  const clear = useCallback(() => persist(EMPTY_LEDGER, false), [persist]);

  const view = useMemo(() => (ledger ? deriveDelta(ledger) : null), [ledger]);

  const value = useMemo<DeltaStore>(
    () => ({
      ready,
      isSample,
      ledger,
      view,
      addTransaction,
      deleteTransaction,
      importTransactions,
      setBudgetLimit,
      addBudget,
      removeBudget,
      addGoal,
      contributeToGoal,
      removeGoal,
      markRecurringPaid,
      removeRecurring,
      updateAccountBalance,
      removeAccount,
      loadSample,
      clear,
    }),
    [
      ready, isSample, ledger, view,
      addTransaction, deleteTransaction, importTransactions,
      setBudgetLimit, addBudget, removeBudget,
      addGoal, contributeToGoal, removeGoal,
      markRecurringPaid, removeRecurring,
      updateAccountBalance, removeAccount,
      loadSample, clear,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDelta(): DeltaStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDelta must be used inside DeltaProvider");
  return ctx;
}

/** True when the ledger has any content worth showing. */
export function ledgerHasData(l: Ledger | null): boolean {
  if (!l) return false;
  return (
    l.accounts.length > 0 ||
    l.transactions.length > 0 ||
    l.budgets.length > 0 ||
    l.goals.length > 0 ||
    l.recurring.length > 0
  );
}
