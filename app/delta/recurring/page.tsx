"use client";

import { CategoryTag } from "@/components/delta/bits";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { monthlyRecurring, RECURRING } from "@/lib/delta/data";
import { fmtUSD } from "@/lib/format";

const CADENCE_LABEL = { monthly: "Monthly", yearly: "Yearly", weekly: "Weekly" } as const;

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function perMonth(amount: number, cadence: keyof typeof CADENCE_LABEL): number {
  if (cadence === "monthly") return amount;
  if (cadence === "yearly") return amount / 12;
  return (amount * 52) / 12;
}

export default function RecurringPage() {
  const sorted = [...RECURRING].sort(
    (a, b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime()
  );
  const subs = RECURRING.filter((r) => r.category === "Subscriptions").length;

  return (
    <div>
      <PageHeader
        eyebrow="Planning"
        title="Recurring"
        description="Subscriptions and bills that hit on a schedule — your fixed monthly burn."
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="px-5 py-4" i={0} hover={false}>
          <Stat label="Per month" value={monthlyRecurring} format={(v) => fmtUSD(v, true)} size="sm" toneClass="text-vio" />
        </Card>
        <Card className="px-5 py-4" i={1} hover={false}>
          <Stat label="Per year" value={monthlyRecurring * 12} format={(v) => fmtUSD(v, true)} size="sm" />
        </Card>
        <Card className="px-5 py-4" i={2} hover={false}>
          <Stat label="Subscriptions" value={subs} format={(v) => String(Math.round(v))} size="sm" sub={`${RECURRING.length} recurring total`} />
        </Card>
      </div>

      <Card className="overflow-hidden" i={3}>
        <CardHeader eyebrow="Schedule" title="Upcoming charges" className="px-6 pt-5 mb-1" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="border-b border-edge text-left text-[11.5px] uppercase tracking-[0.04em] text-faint">
                <th className="px-6 py-3 font-medium">Charge</th>
                <th className="hidden px-6 py-3 font-medium sm:table-cell">Category</th>
                <th className="px-6 py-3 text-right font-medium">Cadence</th>
                <th className="px-6 py-3 text-right font-medium">Next</th>
                <th className="px-6 py-3 text-right font-medium">Amount</th>
                <th className="hidden px-6 py-3 text-right font-medium md:table-cell">/mo</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-edge/60 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-6 py-3 text-ink">{r.name}</td>
                  <td className="hidden px-6 py-3 sm:table-cell">
                    <CategoryTag category={r.category} />
                  </td>
                  <td className="px-6 py-3 text-right text-mute">{CADENCE_LABEL[r.cadence]}</td>
                  <td className="px-6 py-3 text-right font-mono tnum text-faint">{shortDate(r.nextDate)}</td>
                  <td className="px-6 py-3 text-right font-mono tnum text-ink">{fmtUSD(r.amount)}</td>
                  <td className="hidden px-6 py-3 text-right font-mono tnum text-faint md:table-cell">
                    {fmtUSD(perMonth(r.amount, r.cadence))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
