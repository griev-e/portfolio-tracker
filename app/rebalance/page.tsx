"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PALETTE } from "@/components/charts/Donut";
import { Card, CardHeader } from "@/components/ui/Card";
import { Computing } from "@/components/ui/Computing";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { TickerLogo } from "@/components/ui/TickerLogo";
import {
  buildGroups,
  currentTargets,
  equalTargets,
  planRebalance,
  type RebalanceMode,
  type RebalancePlan,
  type TargetBasis,
} from "@/lib/analytics/rebalance";
import { fmtNum, fmtPct, fmtShares, fmtUSD } from "@/lib/format";
import { usePortfolio } from "@/lib/store";
import { useAsyncCompute } from "@/lib/useAsyncCompute";

const BASES: { id: TargetBasis; label: string }[] = [
  { id: "holding", label: "By holding" },
  { id: "sector", label: "By sector" },
  { id: "style", label: "By style" },
];

const QUICK_CASH = [1000, 5000, 10000];

function planToText(plan: RebalancePlan): string {
  const verb = plan.mode === "deploy" ? "Deploy" : "Rebalance";
  const head = `${verb} ${fmtUSD(plan.contribution)} · targets by ${plan.basis}`;
  const rows = plan.orders
    .filter((o) => o.action !== "hold")
    .map(
      (o) =>
        `${o.action.toUpperCase().padEnd(4)} ${fmtUSD(o.dollars).padStart(12)}  ${fmtShares(o.shares)} sh  ${o.symbol}`
    );
  if (rows.length === 0) rows.push("(already at target — no trades)");
  return [head, ...rows].join("\n");
}

function planToCSV(plan: RebalancePlan): string {
  const header = "symbol,action,dollars,shares,price,currentWeightPct,targetProjectedPct";
  const rows = plan.orders
    .filter((o) => o.action !== "hold")
    .map((o) =>
      [
        o.symbol,
        o.action,
        o.dollars.toFixed(2),
        o.shares.toFixed(4),
        o.price.toFixed(2),
        (o.currentWeight * 100).toFixed(2),
        (o.projectedWeight * 100).toFixed(2),
      ].join(",")
    );
  return [header, ...rows].join("\n");
}

export default function RebalancePage() {
  const { ready, portfolio } = usePortfolio();

  const [basis, setBasis] = useState<TargetBasis>("holding");
  const [mode, setMode] = useState<RebalanceMode>("deploy");
  const [contribution, setContribution] = useState(0);
  const [alsoDeployCash, setAlsoDeployCash] = useState(false);
  const [wholeShares, setWholeShares] = useState(false);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);

  const groups = useMemo(
    () => (portfolio ? buildGroups(portfolio, basis) : []),
    [portfolio, basis]
  );

  // Reset targets to the current mix whenever the bucket set changes
  // (switching basis, loading a portfolio).
  const groupSig = groups.map((g) => g.id).join("|");
  useEffect(() => {
    if (groups.length) setTargets(currentTargets(groups));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupSig]);

  const colorOf = useMemo(() => {
    const m: Record<string, string> = {};
    groups.forEach((g, i) => (m[g.id] = PALETTE[i % PALETTE.length]));
    return m;
  }, [groups]);

  const targetSum = groups.reduce((s, g) => s + (targets[g.id] ?? 0), 0);
  const balanced = Math.abs(targetSum - 100) < 0.1;

  const { value: plan, pending } = useAsyncPlan(
    portfolio,
    basis,
    targets,
    contribution,
    mode,
    alsoDeployCash,
    wholeShares
  );

  if (!ready) return null;
  if (!portfolio) return <EmptyState page="The rebalancer" />;

  const normalize = () => {
    if (targetSum <= 0) return;
    const next: Record<string, number> = {};
    for (const g of groups) next[g.id] = ((targets[g.id] ?? 0) / targetSum) * 100;
    setTargets(next);
  };

  const buys = plan?.orders.filter((o) => o.action === "buy").length ?? 0;
  const sells = plan?.orders.filter((o) => o.action === "sell").length ?? 0;

  const scaleMax = plan
    ? Math.max(
        ...plan.groups.flatMap((g) => [
          g.currentWeight,
          g.targetWeight,
          g.projectedWeight,
        ]),
        0.01
      ) * 1.08
    : 1;

  const copyPlan = () => {
    if (!plan) return;
    navigator.clipboard?.writeText(planToText(plan)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  const downloadPlan = () => {
    if (!plan) return;
    const blob = new Blob([planToCSV(plan)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grieve-rebalance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio"
        title="Rebalancer"
        description="Deploy new cash to drift back toward your target mix without selling, or run a full buy-and-sell rebalance. Set targets by holding, sector, or investment style. Estimates from current prices — not trade advice."
      />

      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        {/* ───────────── Controls ───────────── */}
        <div className="space-y-5">
          {/* Basis */}
          <Card className="px-5 py-5" i={0}>
            <CardHeader eyebrow="Targets by" title="Allocation basis" className="mb-3" />
            <div className="flex rounded-lg border border-edge p-1">
              {BASES.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBasis(b.id)}
                  className={`relative flex-1 rounded-md py-1.5 text-[12px] font-medium transition-colors ${
                    basis === b.id ? "text-black" : "text-mute hover:text-ink"
                  }`}
                >
                  {basis === b.id && (
                    <motion.span
                      layoutId="basis-pill"
                      className="absolute inset-0 rounded-md bg-ink"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span className="relative z-10">{b.label}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* Cash to add */}
          <Card className="px-5 py-5" i={1}>
            <CardHeader eyebrow="New cash" title="Amount to add" className="mb-3" />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-faint">
                $
              </span>
              <input
                type="number"
                min={0}
                step={500}
                value={contribution || ""}
                onChange={(e) => setContribution(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0"
                className="field !pl-7 !text-[15px]"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {QUICK_CASH.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setContribution((c) => c + amt)}
                  className="rounded-md border border-edge bg-void/40 px-2.5 py-1 font-mono text-[11px] text-mute transition-colors hover:border-mint/30 hover:text-mint"
                >
                  +${amt / 1000}k
                </button>
              ))}
              <button
                onClick={() => setContribution(0)}
                className="rounded-md border border-edge bg-void/40 px-2.5 py-1 font-mono text-[11px] text-faint transition-colors hover:text-ink"
              >
                clear
              </button>
            </div>
            <button
              onClick={() => setAlsoDeployCash((v) => !v)}
              className="mt-3 flex w-full items-center gap-2.5 text-left"
            >
              <Toggle on={alsoDeployCash} />
              <span className="text-[12px] text-mute">
                Also deploy existing cash
                <span className="ml-1 font-mono text-faint">
                  ({fmtUSD(portfolio.cash)} idle)
                </span>
              </span>
            </button>
          </Card>

          {/* Mode */}
          <Card className="px-5 py-5" i={2}>
            <CardHeader eyebrow="Method" title="Rebalance mode" className="mb-3" />
            <div className="flex rounded-lg border border-edge p-1">
              {(
                [
                  ["deploy", "Deploy cash"],
                  ["full", "Full rebalance"],
                ] as [RebalanceMode, string][]
              ).map(([m, lbl]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`relative flex-1 rounded-md py-1.5 text-[12px] font-medium transition-colors ${
                    mode === m ? "text-black" : "text-mute hover:text-ink"
                  }`}
                >
                  {mode === m && (
                    <motion.span
                      layoutId="mode-pill"
                      className="absolute inset-0 rounded-md bg-ink"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span className="relative z-10">{lbl}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
              {mode === "deploy"
                ? "Buy only. New cash flows to underweight buckets to close the gap — nothing is sold, so no gains are realized."
                : "Buy and sell to hit the targets exactly. Generates sales (and potential taxable gains)."}
            </p>
            <button
              onClick={() => setWholeShares((v) => !v)}
              className="mt-3 flex w-full items-center gap-2.5 text-left"
            >
              <Toggle on={wholeShares} />
              <span className="text-[12px] text-mute">Whole shares only</span>
            </button>
          </Card>

          {/* Targets */}
          <Card className="px-5 py-5" i={3}>
            <CardHeader
              eyebrow="Target mix"
              title="Set allocations"
              right={
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setTargets(currentTargets(groups))}
                    className="rounded-md border border-edge px-2 py-1 text-[11px] text-mute transition-colors hover:text-ink"
                  >
                    Current
                  </button>
                  <button
                    onClick={() => setTargets(equalTargets(groups))}
                    className="rounded-md border border-edge px-2 py-1 text-[11px] text-mute transition-colors hover:text-ink"
                  >
                    Equal
                  </button>
                </div>
              }
              className="mb-3"
            />
            <div className="max-h-[360px] space-y-2.5 overflow-y-auto pr-1">
              {groups.map((g) => {
                const t = targets[g.id] ?? 0;
                const color = colorOf[g.id];
                return (
                  <div key={g.id}>
                    <div className="flex items-center gap-2">
                      {basis === "holding" && (
                        <TickerLogo symbol={g.id} accent={color} size={20} />
                      )}
                      <span className="flex-1 truncate font-mono text-[12px] text-ink">
                        {g.label}
                      </span>
                      <span className="font-mono text-[10.5px] text-faint">
                        now {fmtPct(g.currentWeight, 1)}
                      </span>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={Number(t.toFixed(1))}
                          onChange={(e) =>
                            setTargets((prev) => ({
                              ...prev,
                              [g.id]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className="w-[58px] rounded-md border border-edge2 bg-panel py-1 pl-2 pr-4 text-right font-mono text-[12px] text-ink outline-none transition-colors focus:border-white/35"
                        />
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-faint">
                          %
                        </span>
                      </div>
                    </div>
                    {/* target bar with a ghost marker at the current weight */}
                    <div className="relative mt-1 h-[3px] overflow-hidden rounded-full bg-white/[0.05]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: color, opacity: 0.85 }}
                        animate={{ width: `${Math.min(t, 100)}%` }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      />
                      <span
                        className="absolute top-1/2 h-[7px] w-px -translate-y-1/2 bg-white/45"
                        style={{ left: `${Math.min(g.currentWeight * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-edge pt-3">
              <span className="text-[11px] text-faint">
                {basis === "holding"
                  ? `${groups.length} holdings`
                  : `${groups.length} buckets`}{" "}
                · white tick = current
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono tnum text-[12px] ${balanced ? "text-mute" : "text-neg"}`}
                >
                  Σ {fmtNum(targetSum, 1)}%
                </span>
                {!balanced && (
                  <button
                    onClick={normalize}
                    className="rounded-md border border-mint/30 bg-mint/[0.07] px-2 py-1 text-[11px] text-mint transition-colors hover:bg-mint/[0.12]"
                  >
                    Normalize
                  </button>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* ───────────── Results ───────────── */}
        <div className="relative min-w-0">
          <Computing active={pending || !plan} label="optimizing…" />
          {!plan && <div className="panel h-[460px]" />}
          <AnimatePresence mode="wait">
            {plan && (
              <motion.div
                key={`${plan.mode}-${plan.basis}-${plan.cashDeployed.toFixed(0)}-${groupSig}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                {/* Summary */}
                <Card className="mb-5 px-6 py-5" hover={false}>
                  <div className="eyebrow mb-3">
                    {plan.mode === "deploy" ? "Cash deployment" : "Full rebalance"} ·{" "}
                    {fmtUSD(plan.contribution)} new cash
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                    <Stat
                      label="Cash deployed"
                      value={plan.cashDeployed}
                      format={(v) => fmtUSD(v)}
                      toneClass="text-mint"
                    />
                    <Stat
                      label="Cash buffer after"
                      value={plan.newCash}
                      format={(v) => fmtUSD(v)}
                      sub={
                        plan.leftoverCash > 1
                          ? `${fmtUSD(plan.leftoverCash)} undeployed`
                          : undefined
                      }
                    />
                    <Stat
                      label="Trades"
                      value={plan.tradeCount}
                      format={(v) => fmtNum(v, 0)}
                      sub={`${buys} buys · ${sells} sells`}
                    />
                    <div>
                      <div className="eyebrow">Allocation drift</div>
                      <div className="mt-1 flex items-baseline gap-1.5 font-mono tnum text-[21px] font-medium leading-tight">
                        <span className="text-faint text-[15px]">
                          {fmtPct(plan.driftBefore / 2, 1)}
                        </span>
                        <span className="text-faint text-[13px]">→</span>
                        <span
                          className={
                            plan.driftAfter <= plan.driftBefore ? "text-pos" : "text-neg"
                          }
                        >
                          {fmtPct(plan.driftAfter / 2, 1)}
                        </span>
                      </div>
                      <div className="mt-1 text-[12px] text-mute">vs target mix</div>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-edge pt-3 font-mono text-[11px] text-faint">
                    Value after {fmtUSD(plan.newTotalValue)} · invested{" "}
                    {fmtUSD(plan.newInvested)} · turnover {fmtPct(plan.turnover, 1)}
                  </div>
                </Card>

                {/* Allocation before → after */}
                <Card className="mb-5 px-6 py-5" hover={false}>
                  <CardHeader
                    eyebrow="Allocation"
                    title="Current → projected"
                    right={
                      <div className="flex items-center gap-3 font-mono text-[10px] text-faint">
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2 w-2 rounded-sm bg-white/30" />{" "}
                          now
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2.5 w-px bg-mint" /> target
                        </span>
                      </div>
                    }
                    className="mb-4"
                  />
                  <div className="space-y-3">
                    {plan.groups.map((g, i) => {
                      const color = colorOf[g.id] ?? PALETTE[i % PALETTE.length];
                      const neg = g.deltaValue < 0;
                      return (
                        <motion.div
                          key={g.id}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-[12px] text-ink">
                              {g.label}
                            </span>
                            <span className="flex items-center gap-2 font-mono tnum text-[11px]">
                              <span className="text-faint">
                                {fmtPct(g.currentWeight, 1)}
                              </span>
                              <span className="text-faint">→</span>
                              <span className="text-ink">
                                {fmtPct(g.projectedWeight, 1)}
                              </span>
                              {Math.abs(g.deltaValue) > 0.5 && (
                                <span
                                  className={`w-[78px] text-right ${neg ? "text-neg" : "text-pos"}`}
                                >
                                  {neg ? "−" : "+"}
                                  {fmtUSD(Math.abs(g.deltaValue))}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="relative h-[12px] overflow-visible rounded-full bg-white/[0.04]">
                            {/* current (ghost) */}
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-white/[0.14]"
                              style={{ width: `${(g.currentWeight / scaleMax) * 100}%` }}
                            />
                            {/* projected (colored) */}
                            <motion.div
                              className="absolute inset-y-0 left-0 rounded-full"
                              style={{ background: color }}
                              initial={{ width: 0 }}
                              animate={{
                                width: `${(g.projectedWeight / scaleMax) * 100}%`,
                              }}
                              transition={{
                                duration: 0.7,
                                delay: 0.1 + i * 0.03,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                            />
                            {/* target marker */}
                            <span
                              className="absolute -top-0.5 h-[16px] w-[1.5px] rounded-full bg-mint"
                              style={{ left: `${(g.targetWeight / scaleMax) * 100}%` }}
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </Card>

                {/* Order ticket */}
                <Card className="px-6 py-5" hover={false}>
                  <CardHeader
                    eyebrow="Order ticket"
                    title="Suggested trades"
                    right={
                      <div className="flex gap-2">
                        <button
                          onClick={copyPlan}
                          className="rounded-md border border-edge px-2.5 py-1 text-[11px] text-mute transition-colors hover:text-ink"
                        >
                          {copied ? "✓ Copied" : "Copy"}
                        </button>
                        <button
                          onClick={downloadPlan}
                          className="rounded-md border border-edge px-2.5 py-1 text-[11px] text-mute transition-colors hover:text-ink"
                        >
                          CSV
                        </button>
                      </div>
                    }
                    className="mb-4"
                  />
                  {plan.tradeCount === 0 ? (
                    <div className="py-8 text-center text-[13px] text-faint">
                      Already at target — no trades needed.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {plan.orders
                        .filter((o) => o.action !== "hold")
                        .map((o, i) => (
                          <motion.div
                            key={o.symbol}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.025 }}
                            className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]"
                          >
                            <TickerLogo
                              symbol={o.symbol}
                              accent={colorOf[o.groupId] ?? PALETTE[i % PALETTE.length]}
                              size={28}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-mono text-[13px] font-medium text-ink">
                                {o.symbol}
                              </div>
                              <div className="max-w-[180px] truncate text-[11px] text-faint">
                                {o.name}
                              </div>
                            </div>
                            <span
                              className={`rounded-md px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-wide ${
                                o.action === "buy"
                                  ? "bg-pos/15 text-pos"
                                  : "bg-neg/15 text-neg"
                              }`}
                            >
                              {o.action}
                            </span>
                            <div className="w-[92px] text-right">
                              <div className="font-mono tnum text-[13px] text-ink">
                                {fmtUSD(o.dollars)}
                              </div>
                              <div className="font-mono tnum text-[11px] text-faint">
                                {fmtShares(o.shares)} sh
                              </div>
                            </div>
                            <div className="hidden w-[96px] text-right font-mono tnum text-[11px] sm:block">
                              <span className="text-faint">
                                {fmtPct(o.currentWeight, 1)}
                              </span>
                              <span className="text-faint"> → </span>
                              <span className="text-mute">
                                {fmtPct(o.projectedWeight, 1)}
                              </span>
                            </div>
                          </motion.div>
                        ))}
                    </div>
                  )}
                  <p className="mt-4 border-t border-edge pt-3 text-[11.5px] leading-relaxed text-faint">
                    {plan.mode === "deploy"
                      ? "Cash-flow rebalancing buys only the underweight buckets, splitting each bucket's allocation across its holdings by current size. When the contribution can't fully close every gap, it's poured in proportionally to the shortfall."
                      : "Full rebalancing trades both directions to hit the exact target weights, distributing each bucket's move across its holdings pro-rata to current size."}
                  </p>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** Small pill toggle matching the dark theme. */
function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-mint/70" : "bg-white/[0.12]"
      }`}
    >
      <motion.span
        className="absolute h-[13px] w-[13px] rounded-full bg-ink"
        animate={{ left: on ? 14 : 3 }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
      />
    </span>
  );
}

/** Plan computation off the critical path, keyed on every input. */
function useAsyncPlan(
  portfolio: ReturnType<typeof usePortfolio>["portfolio"],
  basis: TargetBasis,
  targets: Record<string, number>,
  contribution: number,
  mode: RebalanceMode,
  alsoDeployCash: boolean,
  wholeShares: boolean
) {
  return useAsyncCompute(
    () =>
      portfolio
        ? planRebalance(portfolio, {
            basis,
            targets,
            contribution,
            mode,
            alsoDeployCash,
            wholeShares,
          })
        : null,
    [portfolio, basis, targets, contribution, mode, alsoDeployCash, wholeShares]
  );
}
