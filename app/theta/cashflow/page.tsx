"use client";

import { MoneyFlowBars } from "@/components/theta/bits";
import { ThetaEmpty } from "@/components/theta/ui";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { ledgerHasData, useTheta } from "@/lib/theta/store";
import { fmtPct, fmtUSD } from "@/lib/format";

export default function CashFlowPage() {
  const { ready, ledger, view } = useTheta();

  if (!ready) return null;
  if (!ledger || !view || !ledgerHasData(ledger)) return <ThetaEmpty page="Cash flow" />;

  const flows = view.cashFlow;
  const months = flows.length || 1;
  const avgIncome = flows.reduce((s, m) => s + m.income, 0) / months;
  const avgExpense = flows.reduce((s, m) => s + m.expenses, 0) / months;
  const avgNet = avgIncome - avgExpense;
  const avgRate = avgIncome > 0 ? avgNet / avgIncome : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Money"
        title="Cash Flow"
        description="What comes in versus what goes out, month by month."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="px-5 py-4" i={0} hover={false}>
          <Stat label="Avg income" value={avgIncome} format={(v) => fmtUSD(v, true)} size="sm" toneClass="text-pos" />
        </Card>
        <Card className="px-5 py-4" i={1} hover={false}>
          <Stat label="Avg spending" value={avgExpense} format={(v) => fmtUSD(v, true)} size="sm" toneClass="text-vio" />
        </Card>
        <Card className="px-5 py-4" i={2} hover={false}>
          <Stat label="Avg net" value={avgNet} format={(v) => `${v >= 0 ? "+" : "−"}${fmtUSD(Math.abs(v), true)}`} size="sm" />
        </Card>
        <Card className="px-5 py-4" i={3} hover={false}>
          <Stat label="Avg savings rate" value={avgRate} format={(v) => fmtPct(v, 0)} size="sm" />
        </Card>
      </div>

      <Card className="mb-5 px-5 py-6" i={4}>
        <CardHeader eyebrow={`Trailing ${months} months`} title="Income vs. spending" className="mb-6" />
        <MoneyFlowBars data={flows} height={220} />
      </Card>

      <Card className="overflow-hidden" i={5}>
        <CardHeader eyebrow="Detail" title="Monthly breakdown" className="px-6 pt-5 mb-1" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-edge text-left text-[11.5px] uppercase tracking-[0.04em] text-faint">
                <th className="px-6 py-3 font-medium">Month</th>
                <th className="px-6 py-3 text-right font-medium">Income</th>
                <th className="px-6 py-3 text-right font-medium">Spending</th>
                <th className="px-6 py-3 text-right font-medium">Net</th>
                <th className="px-6 py-3 text-right font-medium">Saved</th>
              </tr>
            </thead>
            <tbody>
              {[...flows].reverse().map((m, idx) => {
                const net = m.income - m.expenses;
                const rate = m.income > 0 ? net / m.income : 0;
                return (
                  <tr key={`${m.month}-${idx}`} className="border-b border-edge/60 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-3 text-ink">{m.month}</td>
                    <td className="px-6 py-3 text-right font-mono tnum text-pos">{fmtUSD(m.income, true)}</td>
                    <td className="px-6 py-3 text-right font-mono tnum text-mute">{fmtUSD(m.expenses, true)}</td>
                    <td className="px-6 py-3 text-right font-mono tnum text-ink">{net >= 0 ? "+" : "−"}{fmtUSD(Math.abs(net), true)}</td>
                    <td className="px-6 py-3 text-right font-mono tnum text-faint">{fmtPct(rate, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
