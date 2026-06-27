"use client";

import { useState } from "react";
import { AddGoalModal, ContributeModal } from "@/components/delta/modals";
import { ActionButton, DeltaEmpty, IconButton, PlusIcon, TrashIcon } from "@/components/delta/ui";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Ring } from "@/components/ui/Ring";
import { Stat } from "@/components/ui/Stat";
import { type Goal } from "@/lib/delta/data";
import { ledgerHasData, useDelta } from "@/lib/delta/store";
import { fmtPct, fmtUSD, fmtUSDCompact } from "@/lib/format";

export default function GoalsPage() {
  const { ready, ledger, removeGoal } = useDelta();
  const [adding, setAdding] = useState(false);
  const [contributing, setContributing] = useState<Goal | null>(null);

  if (!ready) return null;
  if (!ledger || !ledgerHasData(ledger)) return <DeltaEmpty page="Goals" />;

  const goals = ledger.goals;
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const totalMonthly = goals.reduce((s, g) => s + g.monthly, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Planning"
        title="Goals"
        description="Money set aside with a purpose, and how close each is to the finish line."
        right={
          <ActionButton onClick={() => setAdding(true)}>
            <PlusIcon /> New goal
          </ActionButton>
        }
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

      {goals.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {goals.map((g, i) => (
            <GoalCard key={g.id} g={g} i={i} onContribute={() => setContributing(g)} onRemove={() => removeGoal(g.id)} />
          ))}
        </div>
      ) : (
        <Card className="px-5 py-12 text-center" i={0}>
          <p className="text-[13px] text-faint">No goals yet — create one to start saving toward it.</p>
        </Card>
      )}

      <AddGoalModal open={adding} onClose={() => setAdding(false)} />
      <ContributeModal goal={contributing} onClose={() => setContributing(null)} />
    </div>
  );
}

function GoalCard({
  g,
  i,
  onContribute,
  onRemove,
}: {
  g: Goal;
  i: number;
  onContribute: () => void;
  onRemove: () => void;
}) {
  const pct = g.target > 0 ? g.saved / g.target : 0;
  const remaining = Math.max(0, g.target - g.saved);
  const monthsToGo = g.monthly > 0 ? Math.ceil(remaining / g.monthly) : Infinity;
  const targetLabel = new Date(`${g.targetDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  return (
    <Card className="group px-5 py-5" i={i + 1}>
      <CardHeader
        eyebrow={`Target ${targetLabel}`}
        title={g.name}
        right={
          <span className="opacity-0 transition-opacity group-hover:opacity-100">
            <IconButton label="Remove goal" danger onClick={onRemove}>
              <TrashIcon />
            </IconButton>
          </span>
        }
        className="mb-4"
      />
      <div className="flex items-center gap-5">
        <Ring score={pct * 100} size={120} stroke={8} color={g.accent}>
          <span className="font-mono text-[19px] font-medium text-ink">{fmtPct(pct, 0)}</span>
          <span className="text-[10px] text-faint">funded</span>
        </Ring>
        <div className="flex-1">
          <div className="font-mono tnum text-[20px] font-medium text-ink">{fmtUSD(g.saved, true)}</div>
          <div className="font-mono text-[12px] text-faint">of {fmtUSD(g.target, true)}</div>
          <div className="mt-3 flex flex-col gap-1.5 text-[12px]">
            <div className="flex justify-between">
              <span className="text-mute">Remaining</span>
              <span className="font-mono tnum text-ink">{fmtUSD(remaining, true)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-mute">On track in</span>
              <span className="font-mono tnum text-ink">{Number.isFinite(monthsToGo) ? `${monthsToGo} mo` : "—"}</span>
            </div>
          </div>
          <button
            onClick={onContribute}
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-edge2 px-3 text-[12.5px] font-medium text-mute transition-colors hover:border-white/30 hover:text-ink"
          >
            <PlusIcon /> Add funds
          </button>
        </div>
      </div>
    </Card>
  );
}
