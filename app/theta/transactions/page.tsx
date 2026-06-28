"use client";

import { useMemo, useState } from "react";
import { TransactionFilter } from "@/components/theta/TransactionFilter";
import { AddTransactionButton } from "@/components/theta/modals";
import { ThetaEmpty } from "@/components/theta/ui";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { CATEGORIES, type Category } from "@/lib/theta/data";
import { ledgerHasData, useTheta } from "@/lib/theta/store";
import { fmtUSD } from "@/lib/format";
import { TxRow } from "./TxRow";

const FILTERS: (Category | "All")[] = [
  "All",
  "Food & Dining",
  "Shopping",
  "Transport",
  "Housing",
  "Utilities",
  "Health",
  "Entertainment",
  "Subscriptions",
  "Travel",
  "Income",
  "Transfer",
];

export default function TransactionsPage() {
  const {
    ready,
    ledger,
    deleteTransaction,
    setTransactionCategory,
    toggleAccountHidden,
    toggleCategoryHidden,
    resetTransactionFilters,
  } = useTheta();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Category | "All">("All");

  const transactions = ledger?.transactions ?? [];
  const accounts = useMemo(() => ledger?.accounts ?? [], [ledger]);
  const hiddenAccounts = useMemo(() => ledger?.hiddenAccounts ?? [], [ledger]);
  const hiddenCategories = useMemo(() => ledger?.hiddenCategories ?? [], [ledger]);
  const acctName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  // Categories actually present in the ledger, in the canonical order.
  const presentCategories = useMemo(() => {
    const seen = new Set(transactions.map((t) => t.category));
    return CATEGORIES.filter((c) => seen.has(c));
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hiddenAcctSet = new Set(hiddenAccounts);
    const hiddenCatSet = new Set(hiddenCategories);
    return transactions.filter((t) => {
      if (hiddenAcctSet.has(t.account)) return false;
      if (hiddenCatSet.has(t.category)) return false;
      if (cat !== "All" && t.category !== cat) return false;
      if (q && !t.merchant.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [transactions, query, cat, hiddenAccounts, hiddenCategories]);

  if (!ready) return null;
  if (!ledger || !ledgerHasData(ledger)) return <ThetaEmpty page="Transactions" />;

  const moneyIn = filtered.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const moneyOut = filtered
    .filter((t) => t.amount < 0 && t.category !== "Transfer")
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Money"
        title="Transactions"
        description="Every charge and deposit across your accounts, newest first."
        right={<AddTransactionButton />}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="px-5 py-4" i={0} hover={false}>
          <Stat label="Transactions" value={filtered.length} format={(v) => String(Math.round(v))} size="sm" />
        </Card>
        <Card className="px-5 py-4" i={1} hover={false}>
          <Stat label="Money in" value={moneyIn} format={(v) => fmtUSD(v, true)} size="sm" toneClass="text-pos" />
        </Card>
        <Card className="px-5 py-4" i={2} hover={false}>
          <Stat label="Money out" value={moneyOut} format={(v) => fmtUSD(v, true)} size="sm" />
        </Card>
      </div>

      <Card className="overflow-hidden" i={3}>
        <div className="flex flex-col gap-3 border-b border-edge px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 lg:w-72">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
                <circle cx="8.6" cy="8.6" r="5.4" />
                <path d="M12.6 12.6 L17 17" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search merchants..."
                className="h-9 w-full rounded-md border border-edge bg-white/[0.03] pl-9 pr-3 text-[13px] text-ink placeholder:text-faint outline-none transition-colors focus:border-edge2"
              />
            </div>
            <TransactionFilter
              accounts={accounts}
              categories={presentCategories}
              hiddenAccounts={hiddenAccounts}
              hiddenCategories={hiddenCategories}
              onToggleAccount={toggleAccountHidden}
              onToggleCategory={toggleCategoryHidden}
              onReset={resetTransactionFilters}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-[12px] transition-colors ${
                  cat === c ? "border-edge2 bg-white/[0.08] text-ink" : "border-edge text-mute hover:text-ink"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <tbody>
              {filtered.map((t, i) => (
                <TxRow
                  key={t.id}
                  t={t}
                  i={i}
                  accountName={acctName(t.account)}
                  onDelete={deleteTransaction}
                  onChangeCategory={setTransactionCategory}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-6 py-10 text-center text-[13px] text-faint">No transactions match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
