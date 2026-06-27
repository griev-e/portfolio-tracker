"use client";

import Link from "next/link";
import { Donut } from "@/components/charts/Donut";
import { CategoryTag, MoneyFlowBars, ProgressBar } from "@/components/delta/bits";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Ring } from "@/components/ui/Ring";
import { Stat } from "@/components/ui/Stat";
import {
  BUDGETS,
  CASH_FLOW,
  CATEGORY_COLOR,
  GOALS,
  monthExpenses,
  monthIncome,
  monthNet,
  netWorth,
  netWorthDelta,
  netWorthDeltaPct,
  prevMonthExpenses,
  savingsRate,
  SPENDING,
  totalAssets,
  totalLiabilities,
  TRANSACTIONS,
} from "@/lib/delta/data";
import { fmtPct, fmtUSD, fmtUSDCompact } from "@/lib/format";
import { TxRow } from "./transactions/TxRow";

export default function DeltaDashboard() {
  const nwUp = netWorthDelta >= 0;
  const expenseDelta = monthExpenses - prevMonthExpenses;

  const spendSlices = SPENDING.map((s) => ({
    id: s.category,
    label: s.category,
    value: s.amount,
    color: CATEGORY_COLOR[s.category],
  }));
  const monthSpend = SPENDING.reduce((s, x) => s + x.amount, 0);

  const topBudgets = [...BUDGETS]
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit)
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="As of Jun 27, 2026 · a snapshot of where your money stands this month"
      />

      {/* Hero — net worth, then the month's flows and balance sheet */}
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
              <AnimatedNumber value={netWorth} format={(v) => fmtUSD(v)} />
            </div>
            <div className="mt-4 flex items-baseline gap-2 font-mono tnum text-[13px]">
              <span className={nwUp ? "text-pos" : "text-neg"}>
                {nwUp ? "▲" : "▼"} {fmtUSD(Math.abs(netWorthDelta))}
              </span>
              <span className={nwUp ? "text-pos" : "text-neg"}>
                {fmtPct(netWorthDeltaPct, 2, true)}
              </span>
              <span className="text-faint">this month</span>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4 lg:self-center lg:border-l lg:border-edge lg:pl-8">
            <Stat label="Assets" value={totalAssets} format={fmtUSDCompact} sub="across 5 accounts" />
            <Stat label="Liabilities" value={totalLiabilities} format={fmtUSDCompact} sub="3 balances owed" />
            <Stat
              label="This month net"
              value={monthNet}
              format={(v) => `${v >= 0 ? "+" : "−"}${fmtUSDCompact(Math.abs(v))}`}
              toneClass={monthNet >= 0 ? "text-pos" : "text-neg"}
              sub="income − spending"
            />
            <Stat
              label="Savings rate"
              value={savingsRate}
              format={(v) => fmtPct(v, 0)}
              sub="of income kept"
              tip="The share of this month's income you didn't spend. A common rule of thumb is to aim for 20% or more."
            />
          </div>
        </div>
      </Card>

      {/* Cash flow + spending mix */}
      <div className="mb-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card className="px-5 py-5" i={1}>
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
          <MoneyFlowBars data={CASH_FLOW} height={150} />
        </Card>

        <Card className="px-5 py-5" i={2}>
          <CardHeader eyebrow="This month" title="Where it went" className="mb-3" />
          <Donut
            slices={spendSlices}
            centerLabel="Spent"
            centerValue={fmtUSDCompact(monthSpend)}
          />
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-edge pt-4">
            {SPENDING.slice(0, 6).map((s) => (
              <div key={s.category} className="flex items-center justify-between">
                <CategoryTag category={s.category} />
                <span className="font-mono tnum text-[12px] text-mute">
                  {fmtUSD(s.amount, true)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Budgets + goals */}
      <div className="mb-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card className="px-5 py-5" i={3}>
          <CardHeader
            eyebrow="Budgets"
            title="This month's pacing"
            right={
              <Link href="/delta/budgets" className="text-[12px] text-faint transition-colors hover:text-ink">
                All budgets →
              </Link>
            }
            className="mb-4"
          />
          <div className="flex flex-col gap-3.5">
            {topBudgets.map((b, i) => {
              const over = b.spent > b.limit;
              return (
                <div key={b.category}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <CategoryTag category={b.category} />
                    <span className="font-mono tnum text-[12px]">
                      <span className={over ? "text-neg" : "text-mute"}>
                        {fmtUSD(b.spent, true)}
                      </span>
                      <span className="text-faint"> / {fmtUSD(b.limit, true)}</span>
                    </span>
                  </div>
                  <ProgressBar
                    value={b.spent}
                    max={b.limit}
                    color={CATEGORY_COLOR[b.category]}
                    delay={0.1 + i * 0.05}
                  />
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="px-5 py-5" i={4}>
          <CardHeader
            eyebrow="Goals"
            title="Savings progress"
            right={
              <Link href="/delta/goals" className="text-[12px] text-faint transition-colors hover:text-ink">
                All goals →
              </Link>
            }
            className="mb-4"
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-2">
            {GOALS.map((g) => {
              const pct = g.saved / g.target;
              return (
                <div key={g.id} className="flex flex-col items-center text-center">
                  <Ring score={pct * 100} size={104} stroke={7} color={g.accent}>
                    <span className="font-mono text-[16px] font-medium text-ink">
                      {fmtPct(pct, 0)}
                    </span>
                  </Ring>
                  <div className="mt-2 truncate text-[12px] font-medium text-ink">
                    {g.name}
                  </div>
                  <div className="font-mono text-[11px] text-faint">
                    {fmtUSDCompact(g.saved)} / {fmtUSDCompact(g.target)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="overflow-hidden" i={5}>
        <CardHeader
          eyebrow="Activity"
          title="Recent transactions"
          right={
            <Link href="/delta/transactions" className="text-[12px] text-faint transition-colors hover:text-ink">
              View all →
            </Link>
          }
          className="px-6 pt-5 mb-1"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <tbody>
              {TRANSACTIONS.slice(0, 8).map((t, i) => (
                <TxRow key={t.id} t={t} i={i} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
