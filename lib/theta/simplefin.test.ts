import { describe, expect, it } from "vitest";
import {
  inferKind,
  isSimplefinAccount,
  mapSimplefin,
  sfAccountId,
  type SfResponse,
} from "./simplefin";

const RESPONSE: SfResponse = {
  errors: [],
  accounts: [
    {
      org: { name: "Robinhood" },
      id: "rh-cash-1",
      name: "Robinhood Spending 1234",
      currency: "USD",
      balance: "2540.18",
      "balance-date": 1_750_000_000,
      transactions: [
        { id: "t1", posted: 1_749_900_000, amount: "-84.20", payee: "Whole Foods", pending: false },
        { id: "t2", posted: 1_749_800_000, amount: "4120.00", description: "ACME PAYROLL" },
        { id: "t3", posted: 1_749_700_000, amount: "-12.99", description: "Netflix", pending: true },
      ],
    },
    {
      org: { name: "American Express" },
      id: "amex-1",
      name: "Platinum Card",
      balance: "615.40", // amount owed, reported positive
      transactions: [],
    },
  ],
};

describe("inferKind", () => {
  it("classifies by name/institution keywords", () => {
    expect(inferKind("Platinum Card")).toBe("credit");
    expect(inferKind("Auto Loan")).toBe("loan");
    expect(inferKind("Roth IRA")).toBe("retirement");
    expect(inferKind("High-Yield Savings")).toBe("savings");
    expect(inferKind("Brokerage", "Robinhood")).toBe("brokerage");
    expect(inferKind("Everyday Account")).toBe("checking");
  });
});

describe("mapSimplefin", () => {
  const { accounts, transactions } = mapSimplefin(RESPONSE);

  it("maps accounts with stable prefixed ids", () => {
    expect(accounts).toHaveLength(2);
    expect(accounts[0].id).toBe(sfAccountId("rh-cash-1"));
    expect(isSimplefinAccount(accounts[0].id)).toBe(true);
    expect(accounts[0].institution).toBe("Robinhood");
    expect(accounts[0].mask).toBe("1234");
    expect(accounts[0].trend).toHaveLength(7);
  });

  it("normalizes a positive liability balance to negative (owed)", () => {
    const amex = accounts.find((a) => a.name === "Platinum Card")!;
    expect(amex.kind).toBe("credit");
    expect(amex.balance).toBe(-615.4);
  });

  it("maps transactions with deterministic ids, dates, categories and sign", () => {
    expect(transactions).toHaveLength(3);
    const food = transactions.find((t) => t.merchant === "Whole Foods")!;
    expect(food.id).toBe(`sf:rh-cash-1:t1`);
    expect(food.amount).toBe(-84.2);
    expect(food.category).toBe("Food & Dining");
    expect(food.account).toBe(sfAccountId("rh-cash-1"));
    expect(food.date).toBe(new Date(1_749_900_000 * 1000).toISOString().slice(0, 10));

    const pay = transactions.find((t) => t.amount === 4120)!;
    expect(pay.category).toBe("Income");

    const pending = transactions.find((t) => t.merchant === "Netflix")!;
    expect(pending.pending).toBe(true);
    expect(pending.category).toBe("Subscriptions");
  });

  it("sorts transactions newest-first and skips id-less rows", () => {
    const dates = transactions.map((t) => t.date);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
    const empty = mapSimplefin({ accounts: [{ id: "", name: "x", balance: "0" }] });
    expect(empty.accounts).toHaveLength(0);
  });
});
