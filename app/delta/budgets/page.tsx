"use client";

import { CategoryTag, ProgressBar } from "@/components/delta/bits";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import {
  BUDGETS,
  CATEGORY_COLOR,
  totalBudget,
  totalBudgetSpent,
} from "@/lib/delta/data";
import { fmtPct, fmtUSD } from "@/lib/format";

export default function BudgetsPage() {
  const remaining = totalBudget - totalBudgetSpent;
  const overCount = BUDGETS.filter((b) => b.spent > b.limit).length;

  return (
    <div>
      <PageHeader
        eyebrow="Planning"
        title="Budgets"
        description="June 2026 · how each category is tracking against its monthly limit."
      />

      <Card className="relative mb-5 overflow-hidden px-6 py-6 sm:px-8" i={0}>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full blur-[90px]"
          style={{ background: "rgba(167,139,250,0.10)" }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
          <div className="lg:w-[240px]">
            <div className="eyebrow">Spent this month</div>
            <div className="mt-1.5 font-mono tnum text-[32px] font-medium leading-none text-ink">
              {fmtUSD(totalBudgetSpent, true)}
            </div>
            <div className="mt-3 font-mono text-[12px] text-faint">
              of {fmtUSD(totalBudget, true)} budgeted
            </div>
            <div className="mt-3 max-w-[240px]">
              <ProgressBar value={totalBudgetSpent} max={totalBudget} height={8} />
            </div>
          </div>
          <div className="grid flex-1 grid-cols-3 gap-x-6 lg:border-l lg:border-edge lg:pl-10">
            <Stat
              label="Remaining"
              value={remaining}
              format={(v) => fmtUSD(v, true)}
              toneClass={remaining >= 0 ? "text-pos" : "text-neg"}
              sub="left to spend"
            />
            <Stat
              label="Used"
              value={totalBudgetSpent / totalBudget}
              format={(v) => fmtPct(v, 0)}
              sub="of total budget"
            />
            <Stat
              label="Over budget"
              value={overCount}
              format={(v) => String(Math.round(v))}
              toneClass={overCount > 0 ? "text-neg" : "text-ink"}
              sub={overCount === 1 ? "category" : "categories"}
            />
          </div>
        </div>
      </Card>

      <Card className="px-5 py-5" i={1}>
        <CardHeader eyebrow="Categories" title="Budget by category" className="mb-5" />
        <div className="flex flex-col gap-5">
          {BUDGETS.map((b, i) => {
            const over = b.spent > b.limit;
            const left = b.limit - b.spent;
            return (
              <div key={b.category}>
                <div className="mb-2 flex items-end justify-between">
                  <CategoryTag category={b.category} className="text-[13px] text-ink" />
                  <div className="text-right">
                    <span className="font-mono tnum text-[13px]">
                      <span className={over ? "text-neg" : "text-ink"}>{fmtUSD(b.spent, true)}</span>
                      <span className="text-faint"> / {fmtUSD(b.limit, true)}</span>
                    </span>
                    <div className={`font-mono text-[11px] ${over ? "text-neg" : "text-faint"}`}>
                      {over ? `${fmtUSD(-left, true)} over` : `${fmtUSD(left, true)} left`}
                    </div>
                  </div>
                </div>
                <ProgressBar
                  value={b.spent}
                  max={b.limit}
                  color={CATEGORY_COLOR[b.category]}
                  height={8}
                  delay={0.05 + i * 0.05}
                />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
