import { describe, expect, it } from "vitest";
import { advanceRecurring, deriveTheta, recurringPerMonth } from "./compute";
import { SAMPLE_LEDGER } from "./data";

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
