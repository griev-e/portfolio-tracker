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
import { useAuth } from "@/components/auth/AuthProvider";
import { getServerState, putLedger } from "@/lib/persist";
import { advanceRecurring, deriveTheta, type ThetaView } from "./compute";
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

const STORAGE_KEY = "theta.ledger.v1";
const SAMPLE_FLAG = "theta.isSample.v1";

type NewTransaction = Omit<Transaction, "id">;

interface ThetaStore {
  /** false until localStorage has been read (avoids hydration flicker). */
  ready: boolean;
  /** The sample ledger is loaded (vs. the user's own imported/edited data). */
  isSample: boolean;
  ledger: Ledger | null;
  view: ThetaView | null;

  addTransaction: (tx: NewTransaction) => void;
  deleteTransaction: (id: string) => void;
  importTransactions: (txs: NewTransaction[]) => void;
  /** Merge a SimpleFIN sync into the ledger (dedup by stable id). */
  applySimplefinSync: (sync: { accounts: Account[]; transactions: Transaction[] }) => void;

  setBudgetLimit: (category: Category, limit: number) => void;
  addBudget: (category: Category, limit: number) => void;
  removeBudget: (category: Category) => void;

  addGoal: (g: Omit<Goal, "id" | "accent"> & { accent?: string }) => void;
  contributeToGoal: (id: string, amount: number) => void;
  removeGoal: (id: string) => void;

  addRecurring: (r: Omit<Recurring, "id">) => void;
  markRecurringPaid: (id: string) => void;
  removeRecurring: (id: string) => void;

  updateAccountBalance: (id: string, balance: number) => void;
  removeAccount: (id: string) => void;

  /** Toggle whether an account's transactions show in the transaction lists. */
  toggleAccountHidden: (id: string) => void;
  /** Clear the transaction-list account filter (show every account again). */
  showAllAccounts: () => void;

  /** Re-tag a transaction's category (e.g. correcting an auto-categorized row). */
  setTransactionCategory: (id: string, category: Category) => void;

  loadSample: () => void;
  clear: () => void;
}

const Ctx = createContext<ThetaStore | null>(null);

function uid(prefix: string): string {
  try {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export function ThetaProvider({ children }: { children: ReactNode }) {
  const { enabled, status } = useAuth();
  // Server-backed when real auth is on and a user is signed in; otherwise the
  // original localStorage model (open mode / not signed in).
  const serverMode = enabled && status === "authenticated";

  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [ready, setReady] = useState(false);

  // Keep the active backend readable from inside the stable write callbacks.
  const serverModeRef = useRef(serverMode);
  useEffect(() => {
    serverModeRef.current = serverMode;
  }, [serverMode]);

  // Persist the ledger to the active backend: server mode pushes the blob to
  // the user's row; open mode writes localStorage (with the sample flag).
  const writeThrough = useCallback((next: Ledger | null, sample: boolean) => {
    if (serverModeRef.current) {
      void putLedger(next);
      return;
    }
    try {
      if (next === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      localStorage.setItem(SAMPLE_FLAG, sample ? "1" : "0");
    } catch {
      // private mode — keep in memory
    }
  }, []);

  // Hydrate from the right backend. In server mode we read ONLY from the server
  // (never the shared-browser localStorage), so one person's ledger can't leak
  // to the next who signs in on the same machine. A brand-new signed-in user
  // starts empty (the Import / Load-sample prompt); the lively auto-seeded
  // sample stays in the open/anonymous mode only.
  useEffect(() => {
    if (!enabled) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          setLedger(JSON.parse(raw) as Ledger);
          setIsSample(localStorage.getItem(SAMPLE_FLAG) === "1");
        } else {
          setLedger(SAMPLE_LEDGER);
          setIsSample(true);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_LEDGER));
            localStorage.setItem(SAMPLE_FLAG, "1");
          } catch {
            /* keep in memory */
          }
        }
      } catch {
        setLedger(SAMPLE_LEDGER);
        setIsSample(true);
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
        setLedger((s?.ledger as Ledger | null) ?? EMPTY_LEDGER);
        setIsSample(false);
        setReady(true);
      });
      return () => {
        alive = false;
      };
    }
    setLedger(EMPTY_LEDGER);
    setIsSample(false);
    setReady(true);
  }, [enabled, status]);

  const persist = useCallback(
    (next: Ledger | null, sample: boolean) => {
      setLedger(next);
      setIsSample(sample);
      writeThrough(next, sample);
    },
    [writeThrough]
  );

  /** Apply a pure update to the ledger; any edit drops the "sample" badge. */
  const mutate = useCallback(
    (fn: (l: Ledger) => Ledger) => {
      setLedger((cur) => {
        const next = fn(cur ?? EMPTY_LEDGER);
        writeThrough(next, false);
        return next;
      });
      setIsSample(false);
    },
    [writeThrough]
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

  const applySimplefinSync = useCallback(
    (sync: { accounts: Account[]; transactions: Transaction[] }) =>
      mutate((l) => {
        // Accounts: upsert the synced rows by id; keep manual accounts untouched
        // and extend (rather than reset) an existing balance trend on each sync.
        const prev = new Map(l.accounts.map((a) => [a.id, a]));
        const synced: Account[] = sync.accounts.map((a) => {
          const existing = prev.get(a.id);
          if (!existing) return a;
          return { ...existing, ...a, trend: [...existing.trend.slice(1), a.balance] };
        });
        const syncedIds = new Set(sync.accounts.map((a) => a.id));
        const accounts = [...l.accounts.filter((a) => !syncedIds.has(a.id)), ...synced];

        // Transactions: incoming (stable-id) rows replace prior copies of
        // themselves (so pending → posted updates in place); manual rows survive.
        const txIds = new Set(sync.transactions.map((t) => t.id));
        const transactions = [
          ...sync.transactions,
          ...l.transactions.filter((t) => !txIds.has(t.id)),
        ].sort((a, b) => b.date.localeCompare(a.date));

        return { ...l, accounts, transactions };
      }),
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

  const addRecurring = useCallback(
    (r: Omit<Recurring, "id">) =>
      mutate((l) => ({
        ...l,
        recurring: [...l.recurring, { ...r, id: uid("r") }],
      })),
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

  const toggleAccountHidden = useCallback(
    (id: string) =>
      mutate((l) => {
        const cur = l.hiddenAccounts ?? [];
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        return { ...l, hiddenAccounts: next };
      }),
    [mutate]
  );

  const showAllAccounts = useCallback(
    () => mutate((l) => ({ ...l, hiddenAccounts: [] })),
    [mutate]
  );

  const setTransactionCategory = useCallback(
    (id: string, category: Category) =>
      mutate((l) => ({
        ...l,
        transactions: l.transactions.map((t) =>
          t.id === id ? { ...t, category } : t
        ),
      })),
    [mutate]
  );

  const loadSample = useCallback(
    () => persist(JSON.parse(JSON.stringify(SAMPLE_LEDGER)) as Ledger, true),
    [persist]
  );
  const clear = useCallback(() => persist(EMPTY_LEDGER, false), [persist]);

  const view = useMemo(() => (ledger ? deriveTheta(ledger) : null), [ledger]);

  const value = useMemo<ThetaStore>(
    () => ({
      ready,
      isSample,
      ledger,
      view,
      addTransaction,
      deleteTransaction,
      importTransactions,
      applySimplefinSync,
      setBudgetLimit,
      addBudget,
      removeBudget,
      addGoal,
      contributeToGoal,
      removeGoal,
      addRecurring,
      markRecurringPaid,
      removeRecurring,
      updateAccountBalance,
      removeAccount,
      toggleAccountHidden,
      showAllAccounts,
      setTransactionCategory,
      loadSample,
      clear,
    }),
    [
      ready, isSample, ledger, view,
      addTransaction, deleteTransaction, importTransactions, applySimplefinSync,
      setBudgetLimit, addBudget, removeBudget,
      addGoal, contributeToGoal, removeGoal,
      addRecurring, markRecurringPaid, removeRecurring,
      updateAccountBalance, removeAccount,
      toggleAccountHidden, showAllAccounts, setTransactionCategory,
      loadSample, clear,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheta(): ThetaStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheta must be used inside ThetaProvider");
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
