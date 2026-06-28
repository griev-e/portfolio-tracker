/**
 * Pure mapping from a SimpleFIN `/accounts` payload onto theta's own shapes.
 *
 * Deliberately isomorphic (no server-only imports): the sync route runs it on
 * the server so the client only ever receives theta-shaped `Account` /
 * `Transaction` records, never the raw provider payload or the access URL.
 *
 * SimpleFIN reference: https://www.simplefin.org/protocol.html — balances and
 * amounts are decimal *strings*, timestamps are Unix *seconds*, and the account
 * `id` / transaction `id` are stable across pulls, which is what lets us dedupe
 * a re-sync (see `applySimplefinSync` in the store).
 */
import {
  type Account,
  type AccountKind,
  type Transaction,
} from "./data";
import { categorize } from "./categorize";

// ── Raw provider shapes (only the fields we read) ───────────────────────────

export type SfOrg = { name?: string; domain?: string };

export type SfTransaction = {
  id: string;
  posted: number; // Unix seconds
  amount: string; // signed decimal string; negative = money out
  description?: string;
  payee?: string;
  pending?: boolean;
};

export type SfAccount = {
  org?: SfOrg;
  id: string;
  name: string;
  currency?: string;
  balance: string; // decimal string
  "balance-date"?: number;
  transactions?: SfTransaction[];
};

export type SfResponse = {
  errors?: string[];
  accounts?: SfAccount[];
};

export type MappedSync = {
  accounts: Account[];
  transactions: Transaction[];
};

const SF_PREFIX = "sf:";

/** Stable theta account id for a SimpleFIN account (matched on re-sync). */
export const sfAccountId = (id: string): string => `${SF_PREFIX}${id}`;
/** Stable theta transaction id, scoped by account to avoid any cross-org clash. */
const sfTxId = (acctId: string, txId: string): string => `${SF_PREFIX}${acctId}:${txId}`;

/** A theta account is SimpleFIN-sourced iff its id carries the sync prefix. */
export const isSimplefinAccount = (id: string): boolean => id.startsWith(SF_PREFIX);

const toNum = (s: string | undefined): number => {
  const n = Number((s ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const isoFromUnix = (secs: number): string =>
  new Date((Number.isFinite(secs) ? secs : 0) * 1000).toISOString().slice(0, 10);

/**
 * Infer theta's account kind from the institution + account name. SimpleFIN
 * has no canonical account-type field, so this is a keyword heuristic; the user
 * can correct any miss with the existing editable balance/account UI.
 */
export function inferKind(name: string, org?: string): AccountKind {
  const s = `${name} ${org ?? ""}`.toLowerCase();
  if (/(401|403b|ira|roth|retire|pension)/.test(s)) return "retirement";
  if (/(credit|card|visa|mastercard|amex|platinum|sapphire)/.test(s)) return "credit";
  if (/(loan|mortgage|student|auto financ)/.test(s)) return "loan";
  if (/(broker|invest|securities|robinhood|fidelity invest)/.test(s)) return "brokerage";
  if (/(saving|hysa|money market)/.test(s)) return "savings";
  return "checking";
}

const isLiability = (kind: AccountKind): boolean => kind === "credit" || kind === "loan";

/** Last 4 digits found in the name, else last 4 of the id, else "". */
function deriveMask(name: string, id: string): string {
  const digits = name.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  const idDigits = id.replace(/\D/g, "");
  return idDigits.length >= 4 ? idDigits.slice(-4) : "";
}

function mapAccount(raw: SfAccount): Account {
  const org = raw.org?.name ?? raw.org?.domain ?? "Bank";
  const kind = inferKind(raw.name, org);
  const rawBal = toNum(raw.balance);
  // theta stores liabilities as negative (what you owe). SimpleFIN feeds are
  // inconsistent about the sign on cards/loans, so normalize: a positive
  // liability balance means "amount owed" → negate it.
  const balance = isLiability(kind) && rawBal > 0 ? -rawBal : rawBal;
  return {
    id: sfAccountId(raw.id),
    name: raw.name || org,
    institution: org,
    kind,
    balance,
    trend: Array(7).fill(balance), // seeded flat; the store extends it per sync
    mask: deriveMask(raw.name, raw.id),
  };
}

function mapTransaction(acctId: string, raw: SfTransaction): Transaction {
  const merchant = (raw.payee || raw.description || "Transaction").trim();
  return {
    id: sfTxId(acctId, raw.id),
    date: isoFromUnix(raw.posted),
    merchant,
    category: categorize(merchant),
    account: sfAccountId(acctId),
    amount: toNum(raw.amount),
    ...(raw.pending ? { pending: true } : {}),
  };
}

/** Map a full SimpleFIN payload into theta accounts + transactions. */
export function mapSimplefin(res: SfResponse): MappedSync {
  const accounts: Account[] = [];
  const transactions: Transaction[] = [];
  for (const acct of res.accounts ?? []) {
    if (!acct?.id) continue;
    accounts.push(mapAccount(acct));
    for (const tx of acct.transactions ?? []) {
      if (!tx?.id) continue;
      transactions.push(mapTransaction(acct.id, tx));
    }
  }
  transactions.sort((a, b) => b.date.localeCompare(a.date));
  return { accounts, transactions };
}
