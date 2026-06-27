/**
 * theta — pure derivations over a ledger.
 *
 * Everything the pages display is computed here from the stored ledger, so an
 * edit (a new transaction, a changed budget limit, a goal contribution) ripples
 * everywhere at once. The "current month" is relative to today, so imported
 * data buckets correctly.
 */

import {
  type Budget,
  type Category,
  type Ledger,
  MONTHS,
  type MonthFlow,
  SPEND_CATEGORIES,
} from "./data";

export type BudgetStatus = Budget & { spent: number };

export type ThetaView = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;

  currentMonthLabel: string;
  monthIncome: number;
  monthExpenses: number;
  monthNet: number;
  savingsRate: number;
  prevMonthExpenses: number;

  spending: { category: Category; amount: number }[];
  monthSpend: number;

  budgets: BudgetStatus[];
  totalBudget: number;
  totalBudgetSpent: number;

  cashFlow: MonthFlow[];
  netWorthSeries: { month: string; value: number }[];
  netWorthDelta: number;
  netWorthDeltaPct: number;

  monthlyRecurring: number;
};

const ym = (iso: string) => iso.slice(0, 7);

function currentYearMonth(now: Date): { key: string; label: string } {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { key, label: MONTHS[now.getMonth()] };
}

/** Normalize a recurring charge to a per-month figure. */
export function recurringPerMonth(amount: number, cadence: string): number {
  if (cadence === "yearly") return amount / 12;
  if (cadence === "weekly") return (amount * 52) / 12;
  return amount;
}

export function deriveTheta(ledger: Ledger, now: Date = new Date()): ThetaView {
  const { key: curKey, label: curLabel } = currentYearMonth(now);

  const totalAssets = ledger.accounts
    .filter((a) => a.balance > 0)
    .reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = ledger.accounts
    .filter((a) => a.balance < 0)
    .reduce((s, a) => s + Math.abs(a.balance), 0);
  const netWorth = totalAssets - totalLiabilities;

  // This month's flows, derived from transactions dated in the current month.
  const thisMonth = ledger.transactions.filter((t) => ym(t.date) === curKey);
  const monthIncome = thisMonth
    .filter((t) => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);
  const monthExpenses = thisMonth
    .filter((t) => t.amount < 0 && t.category !== "Transfer")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const monthNet = monthIncome - monthExpenses;
  const savingsRate = monthIncome > 0 ? monthNet / monthIncome : 0;

  // Spending by category this month (living spend only).
  const spendMap = new Map<Category, number>();
  for (const t of thisMonth) {
    if (t.amount >= 0 || !SPEND_CATEGORIES.includes(t.category)) continue;
    spendMap.set(t.category, (spendMap.get(t.category) ?? 0) + Math.abs(t.amount));
  }
  const spending = [...spendMap.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const monthSpend = spending.reduce((s, x) => s + x.amount, 0);

  // Budgets: limit is stored, spent is derived from this month's transactions.
  const budgets: BudgetStatus[] = ledger.budgets.map((b) => ({
    ...b,
    spent: spendMap.get(b.category) ?? 0,
  }));
  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  const totalBudgetSpent = budgets.reduce((s, b) => s + b.spent, 0);

  // Series = stored history + the live current point.
  const cashFlow: MonthFlow[] = [
    ...ledger.flowHistory,
    { month: curLabel, income: monthIncome, expenses: monthExpenses },
  ];
  const netWorthSeries = [
    ...ledger.netWorthHistory,
    { month: curLabel, value: netWorth },
  ];
  const prevPoint = netWorthSeries[netWorthSeries.length - 2];
  const netWorthDelta = prevPoint ? netWorth - prevPoint.value : 0;
  const netWorthDeltaPct =
    prevPoint && prevPoint.value !== 0 ? netWorthDelta / prevPoint.value : 0;

  const prevFlow = cashFlow[cashFlow.length - 2];
  const prevMonthExpenses = prevFlow ? prevFlow.expenses : monthExpenses;

  const monthlyRecurring = ledger.recurring.reduce(
    (s, r) => s + recurringPerMonth(r.amount, r.cadence),
    0
  );

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    currentMonthLabel: curLabel,
    monthIncome,
    monthExpenses,
    monthNet,
    savingsRate,
    prevMonthExpenses,
    spending,
    monthSpend,
    budgets,
    totalBudget,
    totalBudgetSpent,
    cashFlow,
    netWorthSeries,
    netWorthDelta,
    netWorthDeltaPct,
    monthlyRecurring,
  };
}

/** Next charge date for a recurring item after marking it paid. */
export function advanceRecurring(nextDate: string, cadence: string): string {
  const d = new Date(`${nextDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return nextDate;
  if (cadence === "yearly") d.setFullYear(d.getFullYear() + 1);
  else if (cadence === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}
