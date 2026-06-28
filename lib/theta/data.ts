/**
 * theta — types and the sample ledger.
 *
 * theta has no backend. Your ledger lives in the browser's localStorage (see
 * lib/theta/store.tsx), exactly like alpha's portfolio. This file defines the
 * shape of that ledger and ships one internally-consistent **sample** so the
 * app feels alive on first visit; everything derived (net worth, spending,
 * budget pacing, cash flow) is computed from the ledger in lib/theta/compute.ts.
 */

export type AccountKind =
  | "checking"
  | "savings"
  | "brokerage"
  | "retirement"
  | "credit"
  | "loan";

export type Account = {
  id: string;
  name: string;
  institution: string;
  kind: AccountKind;
  /** Positive for assets, negative for liabilities (what you owe). */
  balance: number;
  /** Trailing daily balances for the row sparkline (oldest → newest). */
  trend: number[];
  mask: string; // last 4, display only
  /** Institution web domain, used to fetch a brand logo. Optional. */
  domain?: string;
};

export type Category =
  | "Housing"
  | "Food & Dining"
  | "Transport"
  | "Shopping"
  | "Subscriptions"
  | "Utilities"
  | "Health"
  | "Entertainment"
  | "Travel"
  | "Income"
  | "Transfer"
  | "Other";

export const CATEGORIES: Category[] = [
  "Housing",
  "Food & Dining",
  "Transport",
  "Shopping",
  "Subscriptions",
  "Utilities",
  "Health",
  "Entertainment",
  "Travel",
  "Income",
  "Transfer",
  "Other",
];

/** Categories that count as discretionary/living spending (not income/moves). */
export const SPEND_CATEGORIES: Category[] = CATEGORIES.filter(
  (c) => c !== "Income" && c !== "Transfer"
);

export type Transaction = {
  id: string;
  date: string; // ISO yyyy-mm-dd
  merchant: string;
  category: Category;
  account: string; // account id
  amount: number; // negative = money out, positive = money in
  pending?: boolean;
};

/** A budget stores only its monthly limit; the amount spent is derived. */
export type Budget = {
  category: Category;
  limit: number;
};

export type Goal = {
  id: string;
  name: string;
  target: number;
  saved: number;
  targetDate: string; // ISO
  monthly: number; // current contribution
  accent: string;
};

export type Recurring = {
  id: string;
  name: string;
  category: Category;
  amount: number;
  cadence: "monthly" | "yearly" | "weekly";
  nextDate: string; // ISO
};

export type MonthFlow = { month: string; income: number; expenses: number };

/** The whole persisted ledger. */
export type Ledger = {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  recurring: Recurring[];
  /** Trailing months EXCLUDING the current one — the current point is derived. */
  netWorthHistory: { month: string; value: number }[];
  flowHistory: MonthFlow[];
  /**
   * Account ids whose transactions are hidden from the transaction lists
   * (e.g. noisy brokerage activity). A view preference, not a data change;
   * the accounts and balances themselves stay untouched.
   */
  hiddenAccounts?: string[];
};

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Stable per-category accent, shared across donut, budgets and tables. */
export const CATEGORY_COLOR: Record<Category, string> = {
  Housing: "#a78bfa",
  "Food & Dining": "#5eead4",
  Transport: "#7dd3fc",
  Shopping: "#fbbf24",
  Subscriptions: "#f0abfc",
  Utilities: "#93c5fd",
  Health: "#fb7185",
  Entertainment: "#34d399",
  Travel: "#fdba74",
  Income: "#34d399",
  Transfer: "#94a3b8",
  Other: "#94a3b8",
};

/**
 * Web domains for common institutions, used to fetch a brand logo when a
 * synced account didn't carry one. Matched as a substring of the institution
 * name (lowercased), most-specific keys first.
 */
const INSTITUTION_DOMAINS: [match: string, domain: string][] = [
  ["american express", "americanexpress.com"],
  ["amex", "americanexpress.com"],
  ["bank of america", "bankofamerica.com"],
  ["capital one", "capitalone.com"],
  ["wells fargo", "wellsfargo.com"],
  ["charles schwab", "schwab.com"],
  ["schwab", "schwab.com"],
  ["navy federal", "navyfederal.org"],
  ["us bank", "usbank.com"],
  ["goldman", "marcus.com"],
  ["marcus", "marcus.com"],
  ["chase", "chase.com"],
  ["ally", "ally.com"],
  ["fidelity", "fidelity.com"],
  ["vanguard", "vanguard.com"],
  ["sofi", "sofi.com"],
  ["robinhood", "robinhood.com"],
  ["citibank", "citi.com"],
  ["citi", "citi.com"],
  ["discover", "discover.com"],
  ["pnc", "pnc.com"],
  ["truist", "truist.com"],
  ["venmo", "venmo.com"],
  ["paypal", "paypal.com"],
  ["coinbase", "coinbase.com"],
  ["etrade", "etrade.com"],
  ["e*trade", "etrade.com"],
  ["betterment", "betterment.com"],
  ["wealthfront", "wealthfront.com"],
  ["chime", "chime.com"],
  ["apple", "apple.com"],
];

/** Best-guess web domain for an institution name (for logo lookup), or "". */
export function institutionDomain(institution: string): string {
  const s = institution.toLowerCase();
  for (const [match, domain] of INSTITUTION_DOMAINS) {
    if (s.includes(match)) return domain;
  }
  return "";
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  checking: "Checking",
  savings: "Savings",
  brokerage: "Brokerage",
  retirement: "Retirement",
  credit: "Credit card",
  loan: "Loan",
};

export const GOAL_ACCENTS = ["#5eead4", "#a78bfa", "#7dd3fc", "#fbbf24", "#34d399", "#fb7185"];

// ── The sample ledger ───────────────────────────────────────────────────────

const SAMPLE_ACCOUNTS: Account[] = [
  { id: "chk", name: "Everyday Checking", institution: "Chase", kind: "checking", balance: 8420.55, trend: [7100, 9300, 6800, 8200, 7600, 9100, 8420], mask: "4471" },
  { id: "sav", name: "High-Yield Savings", institution: "Ally", kind: "savings", balance: 32150.0, trend: [27800, 28600, 29400, 30100, 30900, 31500, 32150], mask: "0098" },
  { id: "bkr", name: "Brokerage", institution: "Fidelity", kind: "brokerage", balance: 64890.12, trend: [58200, 60100, 59400, 62300, 61700, 63900, 64890], mask: "2210" },
  { id: "401k", name: "401(k)", institution: "Vanguard", kind: "retirement", balance: 118500.0, trend: [104000, 107500, 109200, 112800, 114600, 116900, 118500], mask: "7732" },
  { id: "roth", name: "Roth IRA", institution: "Fidelity", kind: "retirement", balance: 22340.0, trend: [18900, 19600, 20100, 20800, 21300, 21900, 22340], mask: "5561" },
  { id: "amex", name: "Platinum Card", institution: "American Express", kind: "credit", balance: -2145.3, trend: [-1800, -2600, -1450, -3100, -2400, -1900, -2145], mask: "1007" },
  { id: "auto", name: "Auto Loan", institution: "Capital One", kind: "loan", balance: -11200.0, trend: [-13600, -13200, -12800, -12400, -12000, -11600, -11200], mask: "3389" },
  { id: "sl", name: "Student Loan", institution: "SoFi", kind: "loan", balance: -8900.0, trend: [-11200, -10800, -10400, -10000, -9600, -9250, -8900], mask: "0042" },
];

const SAMPLE_BUDGETS: Budget[] = [
  { category: "Housing", limit: 2100 },
  { category: "Food & Dining", limit: 800 },
  { category: "Transport", limit: 400 },
  { category: "Shopping", limit: 350 },
  { category: "Utilities", limit: 260 },
  { category: "Health", limit: 200 },
  { category: "Entertainment", limit: 180 },
  { category: "Subscriptions", limit: 100 },
];

const SAMPLE_GOALS: Goal[] = [
  { id: "ef", name: "Emergency Fund", target: 30000, saved: 24500, targetDate: "2026-12-01", monthly: 750, accent: "#5eead4" },
  { id: "house", name: "House Down Payment", target: 80000, saved: 41200, targetDate: "2028-06-01", monthly: 1500, accent: "#a78bfa" },
  { id: "japan", name: "Japan Trip", target: 6000, saved: 3800, targetDate: "2026-10-01", monthly: 500, accent: "#7dd3fc" },
  { id: "car", name: "New Car", target: 25000, saved: 9000, targetDate: "2027-09-01", monthly: 600, accent: "#fbbf24" },
];

const SAMPLE_RECURRING: Recurring[] = [
  { id: "rent", name: "Rent", category: "Housing", amount: 2100, cadence: "monthly", nextDate: "2026-07-01" },
  { id: "car-ins", name: "Auto Insurance", category: "Transport", amount: 142, cadence: "monthly", nextDate: "2026-07-03" },
  { id: "phone", name: "Mobile — Verizon", category: "Utilities", amount: 85, cadence: "monthly", nextDate: "2026-07-05" },
  { id: "internet", name: "Internet — Xfinity", category: "Utilities", amount: 70, cadence: "monthly", nextDate: "2026-07-08" },
  { id: "electric", name: "Electric — ConEd", category: "Utilities", amount: 118, cadence: "monthly", nextDate: "2026-07-12" },
  { id: "gym", name: "Equinox", category: "Health", amount: 39, cadence: "monthly", nextDate: "2026-06-29" },
  { id: "netflix", name: "Netflix", category: "Subscriptions", amount: 15.49, cadence: "monthly", nextDate: "2026-07-02" },
  { id: "spotify", name: "Spotify", category: "Subscriptions", amount: 11.99, cadence: "monthly", nextDate: "2026-07-06" },
  { id: "icloud", name: "iCloud+", category: "Subscriptions", amount: 2.99, cadence: "monthly", nextDate: "2026-07-09" },
  { id: "prime", name: "Amazon Prime", category: "Shopping", amount: 139, cadence: "yearly", nextDate: "2027-02-14" },
];

const SAMPLE_TRANSACTIONS: Transaction[] = [
  { id: "t1", date: "2026-06-27", merchant: "Blue Bottle Coffee", category: "Food & Dining", account: "amex", amount: -6.75, pending: true },
  { id: "t2", date: "2026-06-26", merchant: "Whole Foods Market", category: "Food & Dining", account: "amex", amount: -118.42 },
  { id: "t3", date: "2026-06-26", merchant: "Uber", category: "Transport", account: "amex", amount: -23.6 },
  { id: "t4", date: "2026-06-25", merchant: "Apple", category: "Shopping", account: "amex", amount: -129.0 },
  { id: "t5", date: "2026-06-25", merchant: "Equinox", category: "Health", account: "chk", amount: -39.0 },
  { id: "t6", date: "2026-06-24", merchant: "Shell", category: "Transport", account: "amex", amount: -52.18 },
  { id: "t7", date: "2026-06-23", merchant: "Netflix", category: "Subscriptions", account: "amex", amount: -15.49 },
  { id: "t8", date: "2026-06-23", merchant: "Trader Joe's", category: "Food & Dining", account: "amex", amount: -64.03 },
  { id: "t9", date: "2026-06-22", merchant: "Transfer to Savings", category: "Transfer", account: "chk", amount: -750.0 },
  { id: "t10", date: "2026-06-20", merchant: "Amazon", category: "Shopping", account: "amex", amount: -83.27 },
  { id: "t11", date: "2026-06-20", merchant: "ConEdison", category: "Utilities", account: "chk", amount: -118.0 },
  { id: "t12", date: "2026-06-19", merchant: "Chipotle", category: "Food & Dining", account: "amex", amount: -14.85 },
  { id: "t13", date: "2026-06-18", merchant: "Spotify", category: "Subscriptions", account: "amex", amount: -11.99 },
  { id: "t14", date: "2026-06-16", merchant: "AMC Theatres", category: "Entertainment", account: "amex", amount: -32.5 },
  { id: "t15", date: "2026-06-15", merchant: "Acme Corp — Payroll", category: "Income", account: "chk", amount: 4120.0 },
  { id: "t16", date: "2026-06-15", merchant: "Verizon", category: "Utilities", account: "chk", amount: -85.0 },
  { id: "t17", date: "2026-06-14", merchant: "CVS Pharmacy", category: "Health", account: "amex", amount: -41.2 },
  { id: "t18", date: "2026-06-13", merchant: "Delta Air Lines", category: "Travel", account: "amex", amount: -284.0 },
  { id: "t19", date: "2026-06-12", merchant: "Sweetgreen", category: "Food & Dining", account: "amex", amount: -16.95 },
  { id: "t20", date: "2026-06-11", merchant: "Rent — Stuy Town", category: "Housing", account: "chk", amount: -2100.0 },
  { id: "t21", date: "2026-06-10", merchant: "Interest Earned", category: "Income", account: "sav", amount: 96.4 },
  { id: "t22", date: "2026-06-09", merchant: "Target", category: "Shopping", account: "amex", amount: -74.62 },
  { id: "t23", date: "2026-06-08", merchant: "Lyft", category: "Transport", account: "amex", amount: -19.4 },
  { id: "t24", date: "2026-06-01", merchant: "Acme Corp — Payroll", category: "Income", account: "chk", amount: 4120.0 },
];

const SAMPLE_NET_WORTH_HISTORY = [
  { month: "Jul", value: 198200 },
  { month: "Aug", value: 201600 },
  { month: "Sep", value: 199800 },
  { month: "Oct", value: 205400 },
  { month: "Nov", value: 209100 },
  { month: "Dec", value: 212700 },
  { month: "Jan", value: 210300 },
  { month: "Feb", value: 215900 },
  { month: "Mar", value: 218400 },
  { month: "Apr", value: 220100 },
  { month: "May", value: 222600 },
];

const SAMPLE_FLOW_HISTORY: MonthFlow[] = [
  { month: "Jan", income: 8200, expenses: 5620 },
  { month: "Feb", income: 8200, expenses: 5180 },
  { month: "Mar", income: 9050, expenses: 5740 },
  { month: "Apr", income: 8200, expenses: 6010 },
  { month: "May", income: 8200, expenses: 5290 },
];

export const SAMPLE_LEDGER: Ledger = {
  accounts: SAMPLE_ACCOUNTS,
  transactions: SAMPLE_TRANSACTIONS,
  budgets: SAMPLE_BUDGETS,
  goals: SAMPLE_GOALS,
  recurring: SAMPLE_RECURRING,
  netWorthHistory: SAMPLE_NET_WORTH_HISTORY,
  flowHistory: SAMPLE_FLOW_HISTORY,
};

/** A fresh, empty ledger — what "clear" leaves behind. */
export const EMPTY_LEDGER: Ledger = {
  accounts: [],
  transactions: [],
  budgets: [],
  goals: [],
  recurring: [],
  netWorthHistory: [],
  flowHistory: [],
};
