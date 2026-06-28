"use client";

import { motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import { ThetaEmpty } from "@/components/theta/ui";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import type { ThetaBrief, ThetaSnapshot } from "@/lib/theta/intelligence";
import { ledgerHasData, useTheta } from "@/lib/theta/store";
import { fmtPct, fmtUSD } from "@/lib/format";

type State =
  | { kind: "idle" } // waiting for the user to ask for a brief
  | { kind: "loading" }
  | { kind: "ready"; brief: ThetaBrief; cached: boolean; costUSD: number | null }
  | { kind: "offline" } // no API key
  | { kind: "error"; message: string };

export default function ThetaIntelligencePage() {
  const { ready, ledger, view } = useTheta();
  const [state, setState] = useState<State>({ kind: "idle" });
  const reqId = useRef(0);

  const buildSnapshot = useCallback((): ThetaSnapshot | null => {
    if (!ledger || !view) return null;
    const recurring = [...ledger.recurring]
      .sort((a, b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime())
      .slice(0, 6);
    return {
      month: view.currentMonthLabel,
      netWorth: Math.round(view.netWorth),
      netWorthDeltaPct: +(view.netWorthDeltaPct * 100).toFixed(2),
      income: Math.round(view.monthIncome),
      expenses: Math.round(view.monthExpenses),
      savingsRate: +(view.savingsRate * 100).toFixed(1),
      monthlyRecurring: Math.round(view.monthlyRecurring),
      topCategories: view.spending.slice(0, 8).map((s) => ({ category: s.category, amount: Math.round(s.amount) })),
      budgets: view.budgets.map((b) => ({ category: b.category, limit: b.limit, spent: Math.round(b.spent) })),
      goals: ledger.goals.map((g) => ({ name: g.name, saved: Math.round(g.saved), target: g.target, monthly: g.monthly })),
      upcomingRecurring: recurring.map((r) => ({ name: r.name, amount: r.amount, nextDate: r.nextDate })),
    };
  }, [ledger, view]);

  const load = useCallback(async () => {
    const snapshot = buildSnapshot();
    if (!snapshot) return;
    const id = ++reqId.current;
    setState({ kind: "loading" });
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      const res = await fetch("/api/theta-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (id !== reqId.current) return;
      if (res.status === 501) {
        setState({ kind: "offline" });
        return;
      }
      if (!res.ok) {
        setState({ kind: "error", message: res.status === 429 ? "Rate limited — try again shortly." : "The brief is unavailable right now." });
        return;
      }
      const data = await res.json();
      setState({ kind: "ready", brief: data.brief, cached: !!data.cached, costUSD: data.costUSD ?? null });
    } catch {
      if (id === reqId.current) setState({ kind: "error", message: "Couldn't reach the brief service." });
    }
  }, [buildSnapshot]);

  if (!ready) return null;
  if (!ledger || !view || !ledgerHasData(ledger)) return <ThetaEmpty page="Intelligence" />;

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Intelligence"
        description="A Claude-written read on your month — what's working, what to watch, what to do next."
        right={
          <button
            onClick={load}
            disabled={state.kind === "loading"}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-edge2 px-3 text-[12.5px] font-medium text-mute transition-colors hover:border-white/30 hover:text-ink disabled:opacity-40"
          >
            {state.kind === "loading"
              ? "Thinking…"
              : state.kind === "ready"
                ? "Regenerate"
                : "Generate brief"}
          </button>
        }
      />

      {/* Deterministic glance — always available, even with no API key. */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="px-5 py-4" i={0} hover={false}>
          <Stat label="Income" value={view.monthIncome} format={(v) => fmtUSD(v, true)} size="sm" toneClass="text-pos" />
        </Card>
        <Card className="px-5 py-4" i={1} hover={false}>
          <Stat label="Spending" value={view.monthExpenses} format={(v) => fmtUSD(v, true)} size="sm" toneClass="text-vio" />
        </Card>
        <Card className="px-5 py-4" i={2} hover={false}>
          <Stat label="Savings rate" value={view.savingsRate} format={(v) => fmtPct(v, 0)} size="sm" />
        </Card>
        <Card className="px-5 py-4" i={3} hover={false}>
          <Stat label="Fixed costs" value={view.monthlyRecurring} format={(v) => fmtUSD(v, true)} size="sm" sub="recurring/mo" />
        </Card>
      </div>

      {state.kind === "idle" && (
        <Card className="px-6 py-10 text-center" i={4}>
          <h2 className="font-display text-[15px] font-medium text-ink">Ready when you are</h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-mute">
            Generate a Claude-written read on your month — what&apos;s working, what to watch, and a
            few concrete moves. Your numbers above are always computed locally.
          </p>
          <button onClick={load} className="btn-primary mt-5">
            Generate brief
          </button>
        </Card>
      )}

      {state.kind === "loading" && (
        <Card className="px-6 py-10 text-center" i={4}>
          <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-vio/30 border-t-vio" />
          <p className="text-[13px] text-mute">Claude is reading your month…</p>
        </Card>
      )}

      {state.kind === "offline" && (
        <Card className="px-6 py-8 text-center" i={4}>
          <h2 className="font-display text-[15px] font-medium text-ink">AI brief is offline</h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-mute">
            Set <span className="font-mono text-[12px] text-faint">ANTHROPIC_API_KEY</span> to enable
            Claude-written monthly money briefs. Everything else in theta works without it — your
            numbers above are computed locally.
          </p>
        </Card>
      )}

      {state.kind === "error" && (
        <Card className="px-6 py-8 text-center" i={4}>
          <p className="text-[13px] text-mute">{state.message}</p>
          <button onClick={load} className="btn-secondary mt-4">Try again</button>
        </Card>
      )}

      {state.kind === "ready" && <BriefView brief={state.brief} cached={state.cached} costUSD={state.costUSD} />}
    </div>
  );
}

function BriefView({ brief, cached, costUSD }: { brief: ThetaBrief; cached: boolean; costUSD: number | null }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card className="relative mb-5 overflow-hidden px-6 py-6 sm:px-8" i={4}>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full blur-[90px]" style={{ background: "rgba(167,139,250,0.12)" }} />
        <div className="relative">
          <div className="eyebrow mb-2">This month</div>
          <h2 className="font-display text-[22px] font-semibold leading-snug tracking-tight text-ink">{brief.headline}</h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-mute">{brief.summary}</p>
        </div>
      </Card>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card className="px-5 py-5" i={5}>
          <CardHeader eyebrow="Going well" title="Wins" className="mb-3" />
          <ul className="flex flex-col gap-2.5">
            {brief.wins.map((w, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] text-mute">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pos" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="px-5 py-5" i={6}>
          <CardHeader eyebrow="Keep an eye on" title="Watch-outs" className="mb-3" />
          <ul className="flex flex-col gap-2.5">
            {brief.watchOuts.map((w, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] text-mute">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {brief.moves.length > 0 && (
        <Card className="mb-5 px-5 py-5" i={7}>
          <CardHeader eyebrow="Options" title="Suggested moves" className="mb-4" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {brief.moves.map((m, i) => (
              <div key={i} className="rounded-lg border border-edge bg-white/[0.02] p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-vio/15 font-mono text-[11px] text-vio">{i + 1}</span>
                  <span className="text-[13px] font-medium text-ink">{m.title}</span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-mute">{m.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-[12.5px] italic text-faint">{brief.goalNote}</p>
        <p className="font-mono text-[11px] text-faint">
          Written by Claude Sonnet 4.6{cached ? " · cached" : ""}
          {costUSD !== null && !cached ? ` · ~$${costUSD.toFixed(4)}` : ""}
        </p>
      </div>
      <p className="mt-3 px-1 text-[11px] leading-relaxed text-faint">
        General financial information generated from your numbers — not personalized investment advice.
      </p>
    </motion.div>
  );
}
