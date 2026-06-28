"use client";

import { CategoryTag } from "@/components/theta/bits";
import { AddRecurringButton } from "@/components/theta/modals";
import { ThetaEmpty, IconButton, TrashIcon } from "@/components/theta/ui";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { recurringPerMonth } from "@/lib/theta/compute";
import { ledgerHasData, useTheta } from "@/lib/theta/store";
import { fmtUSD } from "@/lib/format";

const CADENCE_LABEL = { monthly: "Monthly", yearly: "Yearly", weekly: "Weekly" } as const;

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RecurringPage() {
  const { ready, ledger, view, markRecurringPaid, removeRecurring } = useTheta();

  if (!ready) return null;
  if (!ledger || !view || !ledgerHasData(ledger)) return <ThetaEmpty page="Recurring charges" />;

  const recurring = ledger.recurring;
  const sorted = [...recurring].sort((a, b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime());
  const subs = recurring.filter((r) => r.category === "Subscriptions").length;

  return (
    <div>
      <PageHeader
        eyebrow="Planning"
        title="Recurring"
        description="Subscriptions and bills that hit on a schedule — your fixed monthly burn."
        right={<AddRecurringButton />}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="px-5 py-4" i={0} hover={false}>
          <Stat label="Per month" value={view.monthlyRecurring} format={(v) => fmtUSD(v, true)} size="sm" toneClass="text-vio" />
        </Card>
        <Card className="px-5 py-4" i={1} hover={false}>
          <Stat label="Per year" value={view.monthlyRecurring * 12} format={(v) => fmtUSD(v, true)} size="sm" />
        </Card>
        <Card className="px-5 py-4" i={2} hover={false}>
          <Stat label="Subscriptions" value={subs} format={(v) => String(Math.round(v))} size="sm" sub={`${recurring.length} recurring total`} />
        </Card>
      </div>

      <Card className="overflow-hidden" i={3}>
        <CardHeader eyebrow="Schedule" title="Upcoming charges" className="px-6 pt-5 mb-1" />
        {sorted.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="border-b border-edge text-left text-[11.5px] uppercase tracking-[0.04em] text-faint">
                  <th className="px-6 py-3 font-medium">Charge</th>
                  <th className="hidden px-6 py-3 font-medium sm:table-cell">Category</th>
                  <th className="px-6 py-3 text-right font-medium">Cadence</th>
                  <th className="px-6 py-3 text-right font-medium">Next</th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                  <th className="px-6 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="group border-b border-edge/60 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-3 text-ink">
                      {r.name}
                      <span className="ml-2 font-mono text-[11px] text-faint">{fmtUSD(recurringPerMonth(r.amount, r.cadence))}/mo</span>
                    </td>
                    <td className="hidden px-6 py-3 sm:table-cell"><CategoryTag category={r.category} /></td>
                    <td className="px-6 py-3 text-right text-mute">{CADENCE_LABEL[r.cadence]}</td>
                    <td className="px-6 py-3 text-right font-mono tnum text-faint">{shortDate(r.nextDate)}</td>
                    <td className="px-6 py-3 text-right font-mono tnum text-ink">{fmtUSD(r.amount)}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => markRecurringPaid(r.id)}
                          className="rounded-md border border-edge2 px-2.5 py-1 text-[11.5px] text-mute transition-colors hover:border-white/30 hover:text-ink"
                        >
                          Mark paid
                        </button>
                        <span className="opacity-0 transition-opacity group-hover:opacity-100">
                          <IconButton label="Remove recurring" danger onClick={() => removeRecurring(r.id)}>
                            <TrashIcon />
                          </IconButton>
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-6 py-12 text-center text-[13px] text-faint">No recurring charges.</p>
        )}
      </Card>
    </div>
  );
}
