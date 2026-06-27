import { describe, expect, it } from "vitest";
import { parseTransactionsCSV, SAMPLE_CSV_TEXT } from "./csv";
import { SAMPLE_LEDGER } from "./data";

const accounts = SAMPLE_LEDGER.accounts;

describe("parseTransactionsCSV", () => {
  it("parses the example CSV and maps accounts by name", () => {
    const { transactions, skipped } = parseTransactionsCSV(SAMPLE_CSV_TEXT, accounts);
    expect(transactions).toHaveLength(4);
    expect(skipped).toBe(0);
    const chk = transactions.find((t) => t.merchant === "Whole Foods");
    expect(chk?.account).toBe("chk"); // "Everyday Checking" → chk
    expect(chk?.amount).toBeCloseTo(-84.2, 2);
    const card = transactions.find((t) => t.merchant === "Netflix");
    expect(card?.account).toBe("amex"); // "Platinum Card" → amex
  });

  it("matches categories case-insensitively, defaulting unknowns to Other", () => {
    const csv = `date,merchant,amount,category\n2026-06-01,Foo,-10,FOOD & DINING\n2026-06-02,Bar,-5,Nonsense`;
    const { transactions } = parseTransactionsCSV(csv, accounts);
    expect(transactions[0].category).toBe("Food & Dining");
    expect(transactions[1].category).toBe("Other");
  });

  it("handles $, commas and parenthesized negatives, in any column order", () => {
    const csv = `Amount,Description,Date\n"($1,234.50)",Rent,06/01/2026\n"$2,000.00",Paycheck,2026-06-02`;
    const { transactions } = parseTransactionsCSV(csv, accounts);
    const rent = transactions.find((t) => t.merchant === "Rent");
    expect(rent?.amount).toBeCloseTo(-1234.5, 2);
    expect(rent?.date).toBe("2026-06-01");
    const pay = transactions.find((t) => t.merchant === "Paycheck");
    expect(pay?.amount).toBeCloseTo(2000, 2);
  });

  it("skips rows missing a date, amount or merchant", () => {
    const csv = `date,merchant,amount\n2026-06-01,,-10\n,Foo,-10\n2026-06-01,Bar,notanumber\n2026-06-01,Good,-12`;
    const { transactions, skipped } = parseTransactionsCSV(csv, accounts);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].merchant).toBe("Good");
    expect(skipped).toBe(3);
  });

  it("falls back to a default account when none is given", () => {
    const csv = `date,merchant,amount\n2026-06-01,Foo,-10`;
    const { transactions } = parseTransactionsCSV(csv, accounts);
    expect(transactions[0].account).toBe("chk"); // first checking account
  });
});
