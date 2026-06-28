"use client";

import Link from "next/link";
import { Donut } from "@/components/charts/Donut";
import { CategoryTag, MoneyFlowBars, ProgressBar } from "@/components/theta/bits";
import { AddTransactionButton } from "@/components/theta/modals";
import { ThetaEmpty } from "@/components/theta/ui";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Ring } from "@/components/ui/Ring";
import { Stat } from "@/components/ui/Stat";
import { CATEGORY_COLOR } from "@/lib/theta/data";
import { ledgerHasData, useTheta } from "@/lib/theta/store";
import { fmtPct, fmtUSD, fmtUSDCompact } from "@/lib/format";
import { TxRow } from "./transactions/TxRow";

export default function ThetaDashboard() {
  const { ready, ledger, view, deleteTransaction, setTransactionCategory } = useTheta();

  if (!ready) return null;
  if (!ledger || !view || !ledgerHasData(ledger)) return <ThetaEmpty page="The dashboard" />;

  const nwUp = view.netWorthDelta >= 0;
  const expenseDelta = view.monthExpenses - view.prevMonthExpenses;
  const acctName = (id: string) => ledger.accounts.find((a) => a.id === id)?.name ?? id;
  // Mirror the Transactions page account filter so brokerage churn the user
  // hid there stays out of the recent-activity table here too.
  const hiddenAccounts = new Set(ledger.hiddenAccounts ?? []);
  const recentTransactions = ledger.transactions
    .filter((t) => !hiddenAccounts.has(t.account))
    .slice(0, 8);
  const assetCount = ledger.accounts.filter((a) => a.balance > 0).length;
  const liabCount = ledger.accounts.filter((a) => a.balance < 0).length;

  const spendSlices = view.spending.map((s) => ({
    id: s.category,
    label: s.category,
    value: s.amount,
    color: CATEGORY_COLOR[s.category],
  }));

  const topBudgets = [...view.budgets]
    .sort((a, b) => (b.limit ? b.spent / b.limit : 0) - (a.limit ? a.spent / a.limit : 0))
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="A snapshot of where your money stands this month"
        right={<AddTransactionButton />}
      />

      <Card className="relative mb-5 overflow-hidden px-6 py-6 sm:px-8" i={0}>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full blur-[90px]"
          style={{ background: nwUp ? "rgba(167,139,250,0.12)" : "rgba(251,113,133,0.10)" }}
        />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-stretch lg:gap-8">
          <div className="lg:w-[260px] lg:shrink-0">
            <div className="eyebrow">Net worth</div>
            <div className="mt-1.5 font-mono tnum text-[34px] font-medium leading-none text-ink sm:text-[40px]">
              <AnimatedNumber value={view.netWorth} format={(v) => fmtUSD(v)} />
            </div>
            <div className="mt-4 flex items-baseline gap-2 font-mono tnum text-[13px]">
              <span className={nwUp ? "text-pos" : "text-neg"}>
                {nwUp ? "▲" : "▼"} {fmtUSD(Math.abs(view.netWorthDelta))}
              </span>
              <span className={nwUp ? "text-pos" : "text-neg"}>
                {fmtPct(view.netWorthDeltaPct, 2, true)}
              </span>
              <span className="text-faint">this month</span>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4 lg:self-center lg:border-l lg:border-edge lg:pl-8">
            <Stat label="Assets" value={view.totalAssets} format={fmtUSDCompact} sub={`across ${assetCount} accounts`} />
            <Stat label="Liabilities" value={view.totalLiabilities} format={fmtUSDCompact} sub={`${liabCount} balances owed`} />
            <Stat
              label="This month net"
              value={view.monthNet}
              format={(v) => `${v >= 0 ? "+" : "−"}${fmtUSDCompact(Math.abs(v))}`}
              toneClass={view.monthNet >= 0 ? "text-pos" : "text-neg"}
              sub="income − spending"
            />
            <Stat
              label="Savings rate"
              value={view.savingsRate}
              format={(v) => fmtPct(v, 0)}
              sub="of income kept"
              tip="The share of this month's income you didn't spend. A common rule of thumb is to aim for 20% or more."
            />
          </div>
        </div>
      </Card>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card className="flex flex-col px-5 py-5" i={1}>
          <CardHeader
            eyebrow="Cash flow"
            title="Income vs. spending"
            right={
              <div className="text-right font-mono text-[12px]">
                <span className={expenseDelta <= 0 ? "text-pos" : "text-neg"}>
                  {expenseDelta <= 0 ? "▼" : "▲"} {fmtUSD(Math.abs(expenseDelta))}
                </span>
                <span className="ml-1.5 text-faint">vs last mo</span>
              </div>
            }
            className="mb-5"
          />
          <div className="flex flex-1 items-center">
            <div className="w-full">
              <MoneyFlowBars data={view.cashFlow} height={170} />
            </div>
          </div>
        </Card>

        <Card className="px-5 py-5" i={2}>
          <CardHeader eyebrow="This month" title="Where it went" className="mb-3" />
          {view.spending.length > 0 ? (
            <>
              <Donut
                slices={spendSlices}
                centerLabel="Spent"
                centerValue={fmtUSDCompact(view.monthSpend)}
              />
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-edge pt-4">
                {view.spending.slice(0, 6).map((s) => (
                  <div key={s.category} className="flex items-center justify-between">
                    <CategoryTag category={s.category} />
                    <span className="font-mono tnum text-[12px] text-mute">{fmtUSD(s.amount, true)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-12 text-center text-[13px] text-faint">No spending logged this month yet.</p>
          )}
        </Card>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card className="px-5 py-5" i={3}>
          <CardHeader
            eyebrow="Budgets"
            title="This month's pacing"
            right={
              <Link href="/theta/budgets" className="text-[12px] text-faint transition-colors hover:text-ink">
                All budgets →
              </Link>
            }
            className="mb-4"
          />
          {topBudgets.length > 0 ? (
            <div className="flex flex-col gap-3.5">
              {topBudgets.map((b, i) => {
                const over = b.spent > b.limit;
                return (
                  <div key={b.category}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <CategoryTag category={b.category} />
                      <span className="font-mono tnum text-[12px]">
                        <span className={over ? "text-neg" : "text-mute"}>{fmtUSD(b.spent, true)}</span>
                        <span className="text-faint"> / {fmtUSD(b.limit, true)}</span>
                      </span>
                    </div>
                    <ProgressBar value={b.spent} max={b.limit} color={CATEGORY_COLOR[b.category]} delay={0.1 + i * 0.05} />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-[13px] text-faint">No budgets set.</p>
          )}
        </Card>

        <Card className="px-5 py-5" i={4}>
          <CardHeader
            eyebrow="Goals"
            title="Savings progress"
            right={
              <Link href="/theta/goals" className="text-[12px] text-faint transition-colors hover:text-ink">
                All goals →
              </Link>
            }
            className="mb-4"
          />
          {ledger.goals.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-2">
              {ledger.goals.slice(0, 4).map((g) => {
                const pct = g.target > 0 ? g.saved / g.target : 0;
                return (
                  <div key={g.id} className="flex flex-col items-center text-center">
                    <Ring score={pct * 100} size={104} stroke={7} color={g.accent}>
                      <span className="font-mono text-[16px] font-medium text-ink">{fmtPct(pct, 0)}</span>
                    </Ring>
                    <div className="mt-2 truncate text-[12px] font-medium text-ink">{g.name}</div>
                    <div className="font-mono text-[11px] text-faint">
                      {fmtUSDCompact(g.saved)} / {fmtUSDCompact(g.target)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-[13px] text-faint">No goals yet.</p>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden" i={5}>
        <CardHeader
          eyebrow="Activity"
          title="Recent transactions"
          right={
            <Link href="/theta/transactions" className="text-[12px] text-faint transition-colors hover:text-ink">
              View all →
            </Link>
          }
          className="px-6 pt-5 mb-1"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <tbody>
              {recentTransactions.map((t, i) => (
                <TxRow
                  key={t.id}
                  t={t}
                  i={i}
                  accountName={acctName(t.account)}
                  onDelete={deleteTransaction}
                  onChangeCategory={setTransactionCategory}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
