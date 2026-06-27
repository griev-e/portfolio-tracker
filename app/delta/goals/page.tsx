"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Ring } from "@/components/ui/Ring";
import { Stat } from "@/components/ui/Stat";
import { type Goal, GOALS } from "@/lib/delta/data";
import { fmtPct, fmtUSD, fmtUSDCompact } from "@/lib/format";

export default function GoalsPage() {
  const totalSaved = GOALS.reduce((s, g) => s + g.saved, 0);
  const totalTarget = GOALS.reduce((s, g) => s + g.target, 0);
  const totalMonthly = GOALS.reduce((s, g) => s + g.monthly, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Planning"
        title="Goals"
        description="Money set aside with a purpose, and how close each is to the finish line."
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="px-5 py-4" i={0} hover={false}>
          <Stat label="Saved" value={totalSaved} format={fmtUSDCompact} size="sm" />
        </Card>
        <Card className="px-5 py-4" i={1} hover={false}>
          <Stat label="Target" value={totalTarget} format={fmtUSDCompact} size="sm" />
        </Card>
        <Card className="px-5 py-4" i={2} hover={false}>
          <Stat label="Contributing" value={totalMonthly} format={(v) => `${fmtUSD(v, true)}/mo`} size="sm" toneClass="text-pos" />
        </Card>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {GOALS.map((g, i) => (
          <GoalCard key={g.id} g={g} i={i} />
        ))}
      </div>
    </div>
  );
}

function GoalCard({ g, i }: { g: Goal; i: number }) {
  const pct = g.saved / g.target;
  const remaining = g.target - g.saved;
  const monthsToGo = g.monthly > 0 ? Math.ceil(remaining / g.monthly) : Infinity;
  const targetLabel = new Date(`${g.targetDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  return (
    <Card className="px-5 py-5" i={i + 3}>
      <CardHeader eyebrow={`Target ${targetLabel}`} title={g.name} className="mb-4" />
      <div className="flex items-center gap-5">
        <Ring score={pct * 100} size={120} stroke={8} color={g.accent}>
          <span className="font-mono text-[19px] font-medium text-ink">{fmtPct(pct, 0)}</span>
          <span className="text-[10px] text-faint">funded</span>
        </Ring>
        <div className="flex-1">
          <div className="font-mono tnum text-[20px] font-medium text-ink">
            {fmtUSD(g.saved, true)}
          </div>
          <div className="font-mono text-[12px] text-faint">of {fmtUSD(g.target, true)}</div>
          <div className="mt-3 flex flex-col gap-1.5 text-[12px]">
            <div className="flex justify-between">
              <span className="text-mute">Remaining</span>
              <span className="font-mono tnum text-ink">{fmtUSD(remaining, true)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-mute">Monthly</span>
              <span className="font-mono tnum text-pos">+{fmtUSD(g.monthly, true)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-mute">On track in</span>
              <span className="font-mono tnum text-ink">
                {Number.isFinite(monthsToGo) ? `${monthsToGo} mo` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
