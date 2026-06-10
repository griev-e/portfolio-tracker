"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Donut, PALETTE } from "@/components/charts/Donut";
import { Treemap } from "@/components/charts/Treemap";
import { Card, CardHeader } from "@/components/ui/Card";
import { Delta, deltaToneClass } from "@/components/ui/Delta";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { riskReport } from "@/lib/analytics/risk";
import { SPX } from "@/lib/data/benchmarks";
import {
  fmtNum,
  fmtPct,
  fmtShares,
  fmtUSD,
  fmtUSDCompact,
} from "@/lib/format";
import { usePortfolio } from "@/lib/store";
import type { Position } from "@/lib/types";

type SortKey = "equity" | "returnPct" | "totalReturn" | "weight" | "symbol";

export default function OverviewPage() {
  const { ready, portfolio } = usePortfolio();
  const [sortKey, setSortKey] = useState<SortKey>("equity");
  const [asc, setAsc] = useState(false);

  const risk = useMemo(
    () => (portfolio ? riskReport(portfolio, SPX.sectorWeights) : null),
    [portfolio]
  );

  const sorted = useMemo(() => {
    if (!portfolio) return [];
    const arr = [...portfolio.positions];
    arr.sort((a, b) => {
      const va = sortKey === "symbol" ? a.symbol : a[sortKey];
      const vb = sortKey === "symbol" ? b.symbol : b[sortKey];
      const cmp =
        typeof va === "string"
          ? va.localeCompare(vb as string)
          : (va as number) - (vb as number);
      return asc ? cmp : -cmp;
    });
    return arr;
  }, [portfolio, sortKey, asc]);

  if (!ready) return null;
  if (!portfolio || !risk) return <EmptyState page="The overview" />;

  const treemapItems = portfolio.positions.map((p) => ({
    id: p.symbol,
    label: p.symbol,
    value: p.equity,
    intensity: p.returnPct,
    sub: p.name,
  }));

  const donutSlices = [
    ...portfolio.positions.map((p, i) => ({
      id: p.symbol,
      label: p.symbol,
      value: p.equity,
      color: PALETTE[i % PALETTE.length],
    })),
    ...(portfolio.cash > 0
      ? [
          {
            id: "cash",
            label: "Cash",
            value: portfolio.cash,
            color: "rgba(148,163,184,0.55)",
          },
        ]
      : []),
  ];

  const setSort = (k: SortKey) => {
    if (k === sortKey) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(k === "symbol");
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio"
        title="Overview"
        description={`Imported ${new Date(portfolio.asOf).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${portfolio.positions.length} positions`}
      />

      {/* Hero strip */}
      <Card className="mb-5 px-6 py-6 sm:px-8" i={0}>
        <div
          className={`grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4 ${
            portfolio.dayChange !== null ? "lg:grid-cols-7" : "lg:grid-cols-6"
          }`}
        >
          <div className="col-span-2">
            <Stat
              label="Net value"
              value={portfolio.totalValue}
              format={(v) => fmtUSD(v)}
              size="lg"
              sub={
                <span>
                  <Delta
                    value={portfolio.totalReturn}
                    format={(v) => `${v >= 0 ? "+" : ""}${fmtUSD(v)}`}
                  />{" "}
                  <Delta
                    value={portfolio.totalReturnPct}
                    format={(v) => `(${fmtPct(v, 2, true)})`}
                  />{" "}
                  all-time
                </span>
              }
            />
          </div>
          {portfolio.dayChange !== null && (
            <Stat
              label="Today"
              value={portfolio.dayChange}
              format={(v) => `${v >= 0 ? "+" : ""}${fmtUSD(v)}`}
              toneClass={portfolio.dayChange >= 0 ? "text-pos" : "text-neg"}
              sub={
                portfolio.dayChangePct !== null
                  ? `${fmtPct(portfolio.dayChangePct, 2, true)} vs prior close`
                  : undefined
              }
            />
          )}
          <Stat
            label="Invested"
            value={portfolio.equityValue}
            format={fmtUSDCompact}
            sub={`${fmtPct(1 - portfolio.cashWeight, 1)} deployed`}
          />
          <Stat
            label="Cash"
            value={portfolio.cash}
            format={fmtUSDCompact}
            sub={`${fmtPct(portfolio.cashWeight, 1)} dry powder`}
          />
          <Stat
            label="Portfolio beta"
            value={risk.beta}
            format={(v) => fmtNum(v, 2)}
            sub="vs S&P 500"
          />
          <Stat
            label="Est. volatility"
            value={risk.volatility}
            format={(v) => fmtPct(v, 1)}
            sub="annualized"
          />
        </div>
      </Card>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card className="px-5 py-5" i={1}>
          <CardHeader
            eyebrow="Allocation map"
            title="Position sizing × performance"
            right={
              <div className="flex items-center gap-3 font-mono text-[10px] text-faint">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-neg/60" /> loss
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-pos/60" /> gain
                </span>
              </div>
            }
            className="mb-4"
          />
          <Treemap items={treemapItems} height={340} />
        </Card>

        <Card className="px-5 py-5" i={2}>
          <CardHeader
            eyebrow="Allocation"
            title="Portfolio mix"
            className="mb-4"
          />
          <Donut
            slices={donutSlices}
            centerLabel="Total"
            centerValue={fmtUSDCompact(portfolio.totalValue)}
          />
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-edge pt-4">
            <Stat
              label="Top holding"
              value={Math.max(...portfolio.positions.map((p) => p.weight), 0)}
              format={(v) => fmtPct(v, 1)}
              size="sm"
              sub="of portfolio"
            />
            <Stat
              label="Effective N"
              value={risk.effectiveN}
              format={(v) => fmtNum(v, 1)}
              size="sm"
              sub="diversification"
            />
            <Stat
              label="Coverage"
              value={risk.coveragePct}
              format={(v) => fmtPct(v, 0)}
              size="sm"
              sub="with fundamentals"
            />
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden" i={3}>
        <CardHeader
          eyebrow="Holdings"
          title="All positions"
          className="px-6 pt-5 mb-1"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-edge text-left">
                {(
                  [
                    ["symbol", "Asset"],
                    ["equity", "Equity"],
                    ["weight", "Weight"],
                    ["returnPct", "Return %"],
                    ["totalReturn", "P&L"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => setSort(key)}
                    className={`cursor-pointer select-none px-6 py-3 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors hover:text-ink ${
                      sortKey === key ? "text-mint" : "text-faint"
                    }`}
                  >
                    {label}
                    {sortKey === key && (asc ? " ↑" : " ↓")}
                  </th>
                ))}
                <th className="px-6 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-faint text-right">
                  Shares · Basis
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <HoldingRow key={p.symbol} p={p} i={i} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function HoldingRow({ p, i }: { p: Position; i: number }) {
  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.25 + i * 0.035, duration: 0.35 }}
      className="border-b border-edge/60 transition-colors hover:bg-white/[0.02]"
    >
      <td className="px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div>
            <div className="font-mono font-medium text-ink">{p.symbol}</div>
            <div className="max-w-[200px] truncate text-[11px] text-faint">
              {p.name}
            </div>
          </div>
          {!p.fundamentals && (
            <span
              className="rounded border border-warn/30 bg-warn/10 px-1.5 py-0.5 font-mono text-[9px] text-warn"
              title="No bundled fundamentals — uses conservative defaults in risk math"
            >
              no data
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-3.5 font-mono tnum text-ink">{fmtUSD(p.equity)}</td>
      <td className="px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="h-[5px] w-20 overflow-hidden rounded-full bg-white/[0.05]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-mint/40 to-mint"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(p.weight * 100 * 2.5, 100)}%` }}
              transition={{ delay: 0.4 + i * 0.03, duration: 0.7 }}
            />
          </div>
          <span className="font-mono tnum text-[12px] text-mute">
            {fmtPct(p.weight, 1)}
          </span>
        </div>
      </td>
      <td className={`px-6 py-3.5 font-mono tnum ${deltaToneClass(p.returnPct)}`}>
        {fmtPct(p.returnPct, 2, true)}
      </td>
      <td className={`px-6 py-3.5 font-mono tnum ${deltaToneClass(p.totalReturn)}`}>
        {p.totalReturn >= 0 ? "+" : ""}
        {fmtUSD(p.totalReturn)}
      </td>
      <td className="px-6 py-3.5 text-right font-mono tnum text-[12px] text-mute">
        {fmtShares(p.shares)} · {fmtUSD(p.costBasis)}
      </td>
    </motion.tr>
  );
}
