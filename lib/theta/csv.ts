/**
 * Forgiving CSV → transactions parser for theta, in the same spirit as alpha's
 * lib/csv.ts: any column order, `$`/`,` formatting, parenthesized negatives,
 * quoted fields. Maps category/account text onto known values where it can.
 */

import {
  type Account,
  type Category,
  CATEGORIES,
  type Transaction,
} from "./data";
import { categorize } from "./categorize";

export type ParsedTx = Omit<Transaction, "id">;

export type ParseResult = {
  transactions: ParsedTx[];
  skipped: number;
};

const CATEGORY_BY_LOWER = new Map(CATEGORIES.map((c) => [c.toLowerCase(), c]));

function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  }
  s = s.replace(/[$,\s]/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** An explicit category column wins; otherwise null so we can infer from merchant. */
function matchCategory(raw: string): Category | null {
  return CATEGORY_BY_LOWER.get(raw.trim().toLowerCase()) ?? null;
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "posted", "transaction date"],
  merchant: ["merchant", "description", "name", "payee", "memo"],
  amount: ["amount", "value", "debit/credit"],
  category: ["category", "type"],
  account: ["account", "account name", "source"],
};

function resolveColumns(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  const lower = header.map((h) => h.toLowerCase());
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const found = lower.findIndex((h) => aliases.includes(h));
    if (found >= 0) idx[field] = found;
  }
  return idx;
}

export function parseTransactionsCSV(text: string, accounts: Account[]): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { transactions: [], skipped: 0 };

  // Map account names/ids onto existing account ids.
  const acctByName = new Map<string, string>();
  for (const a of accounts) {
    acctByName.set(a.name.toLowerCase(), a.id);
    acctByName.set(a.id.toLowerCase(), a.id);
  }
  const defaultAccount =
    accounts.find((a) => a.kind === "checking")?.id ?? accounts[0]?.id ?? "chk";

  const firstCols = splitCSVLine(lines[0]);
  const hasHeader = firstCols.some((c) =>
    ["date", "amount", "merchant", "description", "category"].includes(c.toLowerCase())
  );
  const cols = hasHeader
    ? resolveColumns(firstCols)
    : { date: 0, merchant: 1, amount: 2, category: 3, account: 4 };
  const rows = hasHeader ? lines.slice(1) : lines;

  const transactions: ParsedTx[] = [];
  let skipped = 0;

  for (const line of rows) {
    const f = splitCSVLine(line);
    const date = cols.date !== undefined ? parseDate(f[cols.date] ?? "") : null;
    const amount = cols.amount !== undefined ? parseAmount(f[cols.amount] ?? "") : null;
    const merchant = (cols.merchant !== undefined ? f[cols.merchant] : "")?.trim();
    if (!date || amount === null || !merchant) {
      skipped++;
      continue;
    }
    // Explicit category column wins; otherwise infer from the merchant string.
    const explicit = cols.category !== undefined ? matchCategory(f[cols.category] ?? "") : null;
    const category = explicit ?? categorize(merchant);
    const acctRaw = (cols.account !== undefined ? f[cols.account] : "")?.trim().toLowerCase();
    const account = (acctRaw && acctByName.get(acctRaw)) || defaultAccount;
    transactions.push({ date, merchant, amount, category, account });
  }

  return { transactions, skipped };
}

export const SAMPLE_CSV_TEXT = `date,merchant,amount,category,account
2026-06-21,Whole Foods,-84.20,Food & Dining,Everyday Checking
2026-06-20,Paycheck,4120.00,Income,Everyday Checking
2026-06-19,Uber,-18.40,Transport,Platinum Card
2026-06-18,Netflix,-15.49,Subscriptions,Platinum Card`;
