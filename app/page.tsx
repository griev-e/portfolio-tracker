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
import { TickerLogo } from "@/components/ui/TickerLogo";
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

type SortKey = "equity" | "returnPct" | "weight" | "symbol" | "today";

export default function OverviewPage() {
  const { ready, portfolio } = usePortfolio();
  const [sortKey, setSortKey] = useState<SortKey>("equity");
  const [asc, setAsc] = useState(false);
  const [mixView, setMixView] = useState<"holding" | "sector">("holding");

  const risk = useMemo(
    () => (portfolio ? riskReport(portfolio, SPX.sectorWeights) : null),
    [portfolio]
  );

  const sorted = useMemo(() => {
    if (!portfolio) return [];
    const arr = [...portfolio.positions];
    arr.sort((a, b) => {
      if (sortKey === "symbol") {
        const cmp = a.symbol.localeCompare(b.symbol);
        return asc ? cmp : -cmp;
      }
      const pick = (p: Position) =>
        sortKey === "today"
          ? (p.dayChange ?? Number.NEGATIVE_INFINITY)
          : p[sortKey];
      const cmp = pick(a) - pick(b);
      return asc ? cmp : -cmp;
    });
    return arr;
  }, [portfolio, sortKey, asc]);

  if (!ready) return null;
  if (!portfolio || !risk) return <EmptyState page="The overview" />;

  // Bar scales for the holdings table, computed once instead of per row.
  const maxWeight = Math.max(
    ...portfolio.positions.map((x) => x.weight),
    0.0001
  );
  const maxAbsReturn = Math.max(
    ...portfolio.positions.map((x) => Math.abs(x.returnPct)),
    0.0001
  );

  const treemapItems = portfolio.positions.map((p) => ({
    id: p.symbol,
    label: p.symbol,
    value: p.equity,
    intensity: p.returnPct,
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

  // Sector mix with ETF look-through (a fund spreads across its underlying
  // sector weights), mirroring the exposure math in lib/analytics/risk.ts.
  const sectorMap = new Map<string, number>();
  for (const p of portfolio.positions) {
    const f = p.fundamentals;
    if (f?.fund) {
      const entries = Object.entries(f.fund.sectorWeights);
      const sum = entries.reduce((s, [, w]) => s + (w ?? 0), 0) || 1;
      for (const [sec, w] of entries) {
        sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + (p.equity * (w ?? 0)) / sum);
      }
    } else {
      const sec = f?.sector ?? "Unknown";
      sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + p.equity);
    }
  }
  const sectorSlices = [
    ...[...sectorMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([sector, value], i) => ({
        id: sector,
        label: sector,
        value,
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

  const mixSlices = mixView === "sector" ? sectorSlices : donutSlices;

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
              <div className="flex items-center gap-3 font-mono text-[12px] text-faint">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-neg/60" /> loss
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-pos/60" /> gain
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
            title="Portfolio Mix"
            right={
              <div className="flex gap-0.5 rounded-md border border-edge p-0.5">
                {(["holding", "sector"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setMixView(v)}
                    className={`rounded px-2 py-0.5 font-mono text-[10.5px] transition-colors ${
                      mixView === v
                        ? "bg-white/[0.08] text-ink"
                        : "text-faint hover:text-ink"
                    }`}
                  >
                    {v === "holding" ? "Holdings" : "Sector"}
                  </button>
                ))}
              </div>
            }
            className="mb-4"
          />
          <Donut
            slices={mixSlices}
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
          right={
            <span className="font-mono text-[10px] text-faint">
              {portfolio.positions.length} positions ·{" "}
              {fmtUSDCompact(portfolio.equityValue)} invested
            </span>
          }
          className="px-6 pt-5 mb-1"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-b border-edge text-left">
                {(
                  [
                    ["symbol", "Asset", false],
                    ["today", "Price · Today", true],
                    ["equity", "Equity", true],
                    ["weight", "Weight", false],
                    ["returnPct", "Total return", true],
                  ] as [SortKey, string, boolean][]
                ).map(([key, label, right]) => (
                  <th
                    key={key}
                    onClick={() => setSort(key)}
                    className={`cursor-pointer select-none px-6 py-3 text-[12px] font-medium transition-colors hover:text-ink ${
                      sortKey === key ? "text-mint" : "text-faint"
                    } ${right ? "text-right" : ""}`}
                  >
                    {label}
                    {sortKey === key && (asc ? " ↑" : " ↓")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <HoldingRow
                  key={p.symbol}
                  p={p}
                  i={i}
                  maxWeight={maxWeight}
                  maxAbsReturn={maxAbsReturn}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/** Stable per-symbol accent so colors survive re-sorting. */
function symbolColor(symbol: string): string {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function HoldingRow({
  p,
  i,
  maxWeight,
  maxAbsReturn,
}: {
  p: Position;
  i: number;
  maxWeight: number;
  maxAbsReturn: number;
}) {
  const accent = symbolColor(p.symbol);
  const dayPct =
    p.dayChange !== null && p.equity - p.dayChange > 0
      ? p.dayChange / (p.equity - p.dayChange)
      : null;
  const neg = p.returnPct < 0;

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.25 + i * 0.035, duration: 0.35 }}
      className="group border-b border-edge/60 transition-colors hover:bg-white/[0.03]"
    >
      {/* Asset: brand logo + symbol + name */}
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <TickerLogo symbol={p.symbol} accent={accent} size={32} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[13px] font-medium text-ink">
                {p.symbol}
              </span>
              {!p.fundamentals && (
                <span
                  className="rounded border border-warn/30 bg-warn/10 px-1 py-px font-mono text-[8.5px] text-warn"
                  title="No fundamentals — uses conservative defaults in risk math"
                >
                  no data
                </span>
              )}
            </div>
            <div className="max-w-[190px] truncate text-[11px] text-faint">
              {p.name}
            </div>
          </div>
        </div>
      </td>

      {/* Price + today's move — the glance column */}
      <td className="px-6 py-3 text-right">
        <div className="font-mono tnum text-[13px] text-ink">
          {fmtUSD(p.price)}
        </div>
        {dayPct !== null && p.dayChange !== null ? (
          <div
            className={`font-mono tnum text-[11px] ${
              p.dayChange >= 0 ? "text-pos" : "text-neg"
            }`}
          >
            {p.dayChange >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(dayPct), 2)} ·{" "}
            {p.dayChange >= 0 ? "+" : "−"}{fmtUSD(Math.abs(p.dayChange))}
          </div>
        ) : (
          <div className="font-mono text-[11px] text-faint">— today</div>
        )}
      </td>

      {/* Equity with shares · basis folded underneath */}
      <td className="px-6 py-3 text-right">
        <div className="font-mono tnum text-[13px] text-ink">
          {fmtUSD(p.equity)}
        </div>
        <div className="font-mono tnum text-[11px] text-faint">
          {fmtShares(p.shares)} sh · {fmtUSD(p.costBasis)}
        </div>
      </td>

      {/* Weight scaled against the largest position */}
      <td className="px-6 py-3">
        <div className="flex items-center gap-2.5">
          <div className="h-[5px] w-20 overflow-hidden rounded-full bg-white/[0.05]">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 45%, transparent), ${accent})`,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${(p.weight / maxWeight) * 100}%` }}
              transition={{ delay: 0.4 + i * 0.03, duration: 0.7 }}
            />
          </div>
          <span className="font-mono tnum text-[12px] text-mute">
            {fmtPct(p.weight, 1)}
          </span>
        </div>
      </td>

      {/* Total return: mirrored bar + stacked % / $ */}
      <td className="px-6 py-3">
        <div className="flex items-center justify-end gap-3">
          <div className="relative h-[16px] w-24">
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
            <motion.div
              className="absolute top-1/2 h-[7px] -translate-y-1/2 rounded-full"
              style={{
                background: neg
                  ? "linear-gradient(270deg, color-mix(in srgb, var(--color-neg) 85%, transparent), color-mix(in srgb, var(--color-neg) 15%, transparent))"
                  : "linear-gradient(90deg, color-mix(in srgb, var(--color-pos) 15%, transparent), color-mix(in srgb, var(--color-pos) 85%, transparent))",
                ...(neg ? { right: "50%" } : { left: "50%" }),
              }}
              initial={{ width: 0 }}
              animate={{
                width: `${(Math.abs(p.returnPct) / maxAbsReturn) * 48}%`,
              }}
              transition={{ delay: 0.35 + i * 0.03, duration: 0.6 }}
            />
          </div>
          <div className="w-[88px] text-right">
            <div className={`font-mono tnum text-[13px] ${deltaToneClass(p.returnPct)}`}>
              {fmtPct(p.returnPct, 2, true)}
            </div>
            <div className={`font-mono tnum text-[11px] ${deltaToneClass(p.totalReturn)} opacity-75`}>
              {p.totalReturn >= 0 ? "+" : "−"}
              {fmtUSD(Math.abs(p.totalReturn))}
            </div>
          </div>
        </div>
      </td>
    </motion.tr>
  );
}
