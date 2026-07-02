import { describe, expect, it } from "vitest";
import { advanceRecurring, deriveTheta, recurringPerMonth } from "./compute";
import { type Ledger, SAMPLE_LEDGER } from "./data";

// Pin "now" into the sample's transaction month so the current-month buckets
// line up with the seeded June data.
const NOW = new Date("2026-06-27T12:00:00Z");

describe("deriveTheta", () => {
  const v = deriveTheta(SAMPLE_LEDGER, NOW);

  it("derives net worth from account balances", () => {
    expect(v.netWorth).toBeCloseTo(224055.37, 2);
    expect(v.totalAssets).toBeGreaterThan(v.totalLiabilities);
    expect(v.totalAssets - v.totalLiabilities).toBeCloseTo(v.netWorth, 2);
  });

  it("buckets this month's income and expenses from transactions", () => {
    // June income: two paychecks (4120 each) + interest (96.40).
    expect(v.monthIncome).toBeCloseTo(8336.4, 2);
    expect(v.monthExpenses).toBeGreaterThan(0);
    expect(v.monthNet).toBeCloseTo(v.monthIncome - v.monthExpenses, 6);
    expect(v.savingsRate).toBeGreaterThan(0);
    expect(v.savingsRate).toBeLessThan(1);
  });

  it("derives budget spend from categorized transactions", () => {
    const housing = v.budgets.find((b) => b.category === "Housing");
    expect(housing?.spent).toBeCloseTo(2100, 2); // the rent transaction
    // A transfer is excluded from spending entirely.
    expect(v.spending.some((s) => s.category === "Transfer")).toBe(false);
  });

  it("appends the live current point to the stored series", () => {
    const cf = v.cashFlow;
    expect(cf[cf.length - 1].month).toBe("Jun");
    expect(cf[cf.length - 1].income).toBeCloseTo(v.monthIncome, 2);
    const nw = v.netWorthSeries;
    expect(nw[nw.length - 1].value).toBeCloseTo(v.netWorth, 2);
  });

  it("sorts spending by amount descending", () => {
    for (let i = 1; i < v.spending.length; i++) {
      expect(v.spending[i - 1].amount).toBeGreaterThanOrEqual(v.spending[i].amount);
    }
  });

  it("never counts a transfer as income, even its receiving leg", () => {
    // A transfer between your own accounts: money out of checking, into savings.
    // Neither leg should land in income or expenses.
    const ledger: Ledger = {
      accounts: [],
      transactions: [
        { id: "out", date: "2026-06-10", merchant: "Transfer to Savings", category: "Transfer", account: "chk", amount: -500 },
        { id: "in", date: "2026-06-10", merchant: "Transfer from Checking", category: "Transfer", account: "sav", amount: 500 },
        { id: "pay", date: "2026-06-01", merchant: "Payroll", category: "Income", account: "chk", amount: 3000 },
      ],
      budgets: [],
      goals: [],
      recurring: [],
      netWorthHistory: [],
      flowHistory: [],
    };
    const v = deriveTheta(ledger, NOW);
    expect(v.monthIncome).toBeCloseTo(3000, 2);
    expect(v.monthExpenses).toBeCloseTo(0, 2);
  });

  it("excludes hidden accounts and categories from the income/spending math", () => {
    const base = {
      budgets: [],
      goals: [],
      recurring: [],
      netWorthHistory: [],
      flowHistory: [],
      accounts: [],
    };
    const transactions = [
      { id: "pay", date: "2026-06-01", merchant: "Payroll", category: "Income" as const, account: "chk", amount: 3000 },
      { id: "buy", date: "2026-06-05", merchant: "Stock Buy", category: "Other" as const, account: "bkr", amount: -9000 },
      { id: "sell", date: "2026-06-06", merchant: "Stock Sell", category: "Other" as const, account: "bkr", amount: 9500 },
      { id: "food", date: "2026-06-07", merchant: "Groceries", category: "Food & Dining" as const, account: "chk", amount: -120 },
    ];
    const unfiltered = deriveTheta({ ...base, transactions }, NOW);
    expect(unfiltered.monthIncome).toBeCloseTo(12500, 2); // brokerage sell inflates it
    expect(unfiltered.monthExpenses).toBeCloseTo(9120, 2);

    // Hiding the brokerage account drops its churn from both sides.
    const filtered = deriveTheta({ ...base, transactions, hiddenAccounts: ["bkr"] }, NOW);
    expect(filtered.monthIncome).toBeCloseTo(3000, 2);
    expect(filtered.monthExpenses).toBeCloseTo(120, 2);

    // Hiding by category does the same.
    const byCat = deriveTheta({ ...base, transactions, hiddenCategories: ["Other"] }, NOW);
    expect(byCat.monthIncome).toBeCloseTo(3000, 2);
    expect(byCat.monthExpenses).toBeCloseTo(120, 2);
  });

  it("is empty-safe", () => {
    const empty = deriveTheta(
      { accounts: [], transactions: [], budgets: [], goals: [], recurring: [], netWorthHistory: [], flowHistory: [] },
      NOW
    );
    expect(empty.netWorth).toBe(0);
    expect(empty.savingsRate).toBe(0);
    expect(empty.monthlyRecurring).toBe(0);
  });
});

describe("recurring helpers", () => {
  it("normalizes cadences to a monthly figure", () => {
    expect(recurringPerMonth(120, "monthly")).toBe(120);
    expect(recurringPerMonth(120, "yearly")).toBe(10);
    expect(recurringPerMonth(120, "weekly")).toBeCloseTo((120 * 52) / 12, 6);
  });

  it("advances the next charge date by cadence", () => {
    expect(advanceRecurring("2026-06-01", "monthly")).toBe("2026-07-01");
    expect(advanceRecurring("2026-06-01", "yearly")).toBe("2027-06-01");
    expect(advanceRecurring("2026-06-01", "weekly")).toBe("2026-06-08");
  });
});

describe("advanceRecurring month-end anchoring", () => {
  it("clamps a month-end anchor instead of rolling into the next month", () => {
    expect(advanceRecurring("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceRecurring("2024-01-31", "monthly")).toBe("2024-02-29"); // leap year
    expect(advanceRecurring("2026-08-31", "monthly")).toBe("2026-09-30");
  });

  it("clamps a Feb-29 yearly anchor to Feb-28 off-leap", () => {
    expect(advanceRecurring("2024-02-29", "yearly")).toBe("2025-02-28");
  });

  it("keeps weekly advances exact", () => {
    expect(advanceRecurring("2026-06-25", "weekly")).toBe("2026-07-02");
  });
});
