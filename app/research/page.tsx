"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardHeader } from "@/components/ui/Card";
import { deltaToneClass } from "@/components/ui/Delta";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { factorScores } from "@/lib/analytics/factors";
import {
  daysUntil,
  fmtDate,
  fmtMultiple,
  fmtPct,
  fmtUSD,
  fmtUSDCompact,
} from "@/lib/format";
import { usePortfolio } from "@/lib/store";
import type { Position } from "@/lib/types";

export default function ResearchPage() {
  const { ready, portfolio } = usePortfolio();
  const [selected, setSelected] = useState<string | null>(null);

  const position = useMemo(() => {
    if (!portfolio) return null;
    return (
      portfolio.positions.find((p) => p.symbol === selected) ??
      portfolio.positions[0] ??
      null
    );
  }, [portfolio, selected]);

  const portfolioIncome = useMemo(() => {
    if (!portfolio) return 0;
    return portfolio.positions.reduce(
      (s, p) => s + p.equity * (p.fundamentals?.dividendYield ?? 0),
      0
    );
  }, [portfolio]);

  if (!ready) return null;
  if (!portfolio || !position) return <EmptyState page="Stock research" />;

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio"
        title="Stock Research"
        description="Fundamental dashboard for every holding, refreshed from live market data"
      />

      {/* Selector rail */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {portfolio.positions.map((p) => {
          const active = p.symbol === position.symbol;
          return (
            <button
              key={p.symbol}
              onClick={() => setSelected(p.symbol)}
              className={`relative shrink-0 rounded-xl border px-4 py-2.5 text-left transition-colors ${
                active
                  ? "border-mint/35 bg-mint/[0.08]"
                  : "border-edge bg-panel hover:border-edge2"
              }`}
            >
              <div
                className={`font-mono text-[13px] font-medium ${
                  active ? "text-mint" : "text-ink"
                }`}
              >
                {p.symbol}
              </div>
              <div
                className={`font-mono tnum text-[11px] ${deltaToneClass(p.returnPct)}`}
              >
                {fmtPct(p.returnPct, 1, true)}
              </div>
            </button>
          );
        })}
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={position.symbol}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <StockDashboard position={position} portfolioIncome={portfolioIncome} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function StockDashboard({
  position: p,
  portfolioIncome,
}: {
  position: Position;
  portfolioIncome: number;
}) {
  const f = p.fundamentals;

  if (!f) {
    return (
      <Card className="px-8 py-10 text-center">
        <h2 className="font-display text-xl font-semibold text-ink">
          {p.symbol} — no fundamentals yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-mute">
          No fundamentals are available for this ticker yet. Position math
          still works everywhere; research, factors, and quality metrics will
          light up once data is available.
        </p>
        <div className="mt-6 flex justify-center gap-8">
          <PositionContext p={p} />
        </div>
      </Card>
    );
  }

  const scores = factorScores(f);
  const upside = f.analyst.priceTarget / p.price - 1;
  const earningsDays = daysUntil(f.earningsDate);

  return (
    <div className="space-y-5">
      {/* Identity + position context */}
      <Card className="px-6 py-5" i={0}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-display text-[24px] font-semibold text-ink">
                {f.name}
              </h2>
              <span className="rounded-md border border-edge bg-void/50 px-2 py-0.5 font-mono text-[11px] text-mute">
                {f.sector}
              </span>
            </div>
            <div className="mt-1 text-[12px] text-faint">
              {f.industry} · {fmtUSDCompact(f.marketCap)} market cap
            </div>
          </div>
          <div className="flex gap-8">
            <PositionContext p={p} />
          </div>
        </div>

        {/* Analyst bullet: low ─ price ─ mean target ─ high */}
        {f.analyst.priceTarget > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="eyebrow">Analyst price target range</span>
            <span className="font-mono text-[11px] text-mute">
              {f.analyst.count > 0 ? `${f.analyst.count} analysts · ` : ""}
              <span className={ratingClass(f.analyst.rating)}>
                {f.analyst.rating}
              </span>
            </span>
          </div>
          <TargetBullet
            low={f.analyst.targetLow}
            high={f.analyst.targetHigh}
            mean={f.analyst.priceTarget}
            price={p.price}
          />
          <div className="mt-2 flex justify-between font-mono tnum text-[11px] text-mute">
            <span>low {fmtUSD(f.analyst.targetLow)}</span>
            <span>
              now {fmtUSD(p.price)} ·{" "}
              <span className={deltaToneClass(upside)}>
                {fmtPct(upside, 1, true)} to mean
              </span>
            </span>
            <span>high {fmtUSD(f.analyst.targetHigh)}</span>
          </div>
        </div>
        )}
      </Card>

      {/* Metric grid */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          i={1}
          title="Growth"
          rows={[
            ["Revenue growth", fmtPct(f.revenueGrowth, 1, true), f.revenueGrowth],
            ["EPS growth", fmtPct(f.epsGrowth, 1, true), f.epsGrowth],
            ["FCF growth", fmtPct(f.fcfGrowth, 1, true), f.fcfGrowth],
            ["12m price return", fmtPct(f.return12m, 1, true), f.return12m],
          ]}
        />
        <MetricCard
          i={2}
          title="Valuation"
          rows={[
            ["Forward P/E", fmtMultiple(f.forwardPE), null],
            ["FCF yield", fmtPct(f.fcfYield, 1), null],
            [
              "PEG ratio",
              f.forwardPE && f.epsGrowth > 0
                ? (f.forwardPE / (f.epsGrowth * 100)).toFixed(2)
                : "—",
              null,
            ],
            ["Dividend yield", fmtPct(f.dividendYield, 2), null],
          ]}
        />
        <MetricCard
          i={3}
          title="Quality"
          rows={[
            ["ROIC", fmtPct(f.roic, 1), f.roic - 0.1],
            ["Operating margin", fmtPct(f.operatingMargin, 1), f.operatingMargin],
            ["Gross margin", fmtPct(f.grossMargin, 1), null],
            ["Beta / Volatility", `${f.beta.toFixed(2)} / ${fmtPct(f.volatility, 0)}`, null],
          ]}
        />
        <Card className="px-5 py-4" i={4}>
          <div className="eyebrow mb-3">Catalysts & flows</div>
          <div className="space-y-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-mute">Next earnings</span>
              <span className="text-right">
                <span className="font-mono tnum text-[13px] text-ink">
                  {fmtDate(f.earningsDate)}
                </span>
                {earningsDays !== null && earningsDays >= 0 && (
                  <span
                    className={`ml-2 font-mono text-[11px] ${
                      earningsDays <= 14 ? "text-warn" : "text-faint"
                    }`}
                  >
                    {earningsDays}d
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-mute">Insider signal</span>
              <span
                className={`font-mono text-[13px] ${
                  f.insider.signal === "Buying"
                    ? "text-pos"
                    : f.insider.signal === "Selling"
                      ? "text-neg"
                      : "text-mute"
                }`}
              >
                {f.insider.signal}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-mute">Net insider 6m</span>
              <span
                className={`font-mono tnum text-[13px] ${deltaToneClass(f.insider.netActivity6m)}`}
              >
                {f.insider.netActivity6m >= 0 ? "+" : ""}
                {fmtUSDCompact(f.insider.netActivity6m)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-mute">Buys / sells 6m</span>
              <span className="font-mono tnum text-[13px] text-ink">
                <span className="text-pos">{f.insider.buys6m}</span>
                {" / "}
                <span className="text-neg">{f.insider.sells6m}</span>
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Dividend analysis */}
      <Card className="px-6 py-5" i={5}>
        <CardHeader
          eyebrow="Dividend analysis"
          title={
            f.dividendYield > 0
              ? `What ${p.symbol} pays you`
              : `${p.symbol} doesn't pay a dividend`
          }
          className="mb-4"
        />
        {f.dividendYield > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              <div>
                <div className="eyebrow">Dividend yield</div>
                <div className="mt-1 font-mono tnum text-[21px] text-ink">
                  {fmtPct(f.dividendYield, 2)}
                </div>
                <div
                  className={`font-mono text-[11px] ${
                    f.dividendYield >= 0.0125 ? "text-pos" : "text-faint"
                  }`}
                >
                  S&P 500 ≈ 1.25%
                </div>
              </div>
              <div>
                <div className="eyebrow">Est. annual income</div>
                <div className="mt-1 font-mono tnum text-[21px] text-mint">
                  {fmtUSD(p.equity * f.dividendYield)}
                </div>
                <div className="font-mono text-[11px] text-faint">
                  ≈ {fmtUSD((p.equity * f.dividendYield) / 12)}/mo from this position
                </div>
              </div>
              <div>
                <div className="eyebrow">Share of portfolio income</div>
                <div className="mt-1 font-mono tnum text-[21px] text-ink">
                  {portfolioIncome > 0
                    ? fmtPct((p.equity * f.dividendYield) / portfolioIncome, 1)
                    : "—"}
                </div>
                <div className="font-mono text-[11px] text-faint">
                  of {fmtUSD(portfolioIncome)}/yr total
                </div>
              </div>
              <div>
                <div className="eyebrow">FCF payout (est.)</div>
                <div
                  className={`mt-1 font-mono tnum text-[21px] ${
                    f.fcfYield > 0 && f.dividendYield / f.fcfYield > 0.8
                      ? "text-warn"
                      : "text-ink"
                  }`}
                >
                  {f.fcfYield > 0
                    ? fmtPct(Math.min(f.dividendYield / f.fcfYield, 2), 0)
                    : "n/m"}
                </div>
                <div className="font-mono text-[11px] text-faint">
                  dividend as share of free cash flow
                </div>
              </div>
            </div>
            <p className="mt-4 border-t border-edge pt-3 text-[11.5px] leading-relaxed text-faint">
              {f.fcfYield > 0 && f.dividendYield / f.fcfYield > 0.8
                ? "Payout is consuming most of free cash flow — watch sustainability if growth stalls."
                : "Payout is comfortably covered by free cash flow."}
            </p>
          </>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-mute">
            All returns here come from price appreciation. Income contribution
            to the portfolio: $0 of {fmtUSD(portfolioIncome)}/yr.
          </p>
        )}
      </Card>

      {/* Factor profile */}
      <Card className="px-6 py-5" i={6}>
        <CardHeader
          eyebrow="Style profile"
          title={`How ${p.symbol} loads on the four factors`}
          className="mb-5"
        />
        <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
          {(
            [
              ["Growth", scores.growth, "var(--color-mint)"],
              ["Value", scores.value, "var(--color-vio)"],
              ["Quality", scores.quality, "var(--color-sky)"],
              ["Momentum", scores.momentum, "var(--color-warn)"],
            ] as const
          ).map(([label, score, color], i) => (
            <div key={label} className="flex items-center gap-4">
              <span className="w-20 font-mono text-[11px] uppercase tracking-wider text-mute">
                {label}
              </span>
              <div className="relative flex-1">
                <div className="h-[7px] w-full rounded-full bg-white/[0.05]" />
                <motion.div
                  className="absolute top-0 h-[7px] rounded-full"
                  style={{
                    background: `linear-gradient(90deg, color-mix(in srgb, ${color} 30%, transparent), ${color})`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${score}%` }}
                  transition={{ duration: 0.9, delay: 0.2 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <span className="w-10 text-right font-mono tnum text-[13px] text-ink">
                {Math.round(score)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 font-mono text-[10px] text-faint">
          0–100 · 50 ≈ broad-market profile
        </div>
      </Card>
    </div>
  );
}

function PositionContext({ p }: { p: Position }) {
  return (
    <>
      <div>
        <div className="eyebrow">Position</div>
        <div className="mt-1 font-mono tnum text-[17px] text-ink">
          {fmtUSD(p.equity)}
        </div>
        <div className="font-mono text-[11px] text-faint">
          {fmtPct(p.weight, 1)} of portfolio
        </div>
      </div>
      <div>
        <div className="eyebrow">Unrealized P&L</div>
        <div
          className={`mt-1 font-mono tnum text-[17px] ${deltaToneClass(p.totalReturn)}`}
        >
          {p.totalReturn >= 0 ? "+" : ""}
          {fmtUSD(p.totalReturn)}
        </div>
        <div className={`font-mono text-[11px] ${deltaToneClass(p.returnPct)}`}>
          {fmtPct(p.returnPct, 2, true)} on cost
        </div>
      </div>
    </>
  );
}

function MetricCard({
  title,
  rows,
  i,
}: {
  title: string;
  rows: [string, string, number | null][];
  i: number;
}) {
  return (
    <Card className="px-5 py-4" i={i}>
      <div className="eyebrow mb-3">{title}</div>
      <div className="space-y-3.5">
        {rows.map(([label, value, toneVal]) => (
          <div key={label} className="flex items-baseline justify-between">
            <span className="text-[12px] text-mute">{label}</span>
            <span
              className={`font-mono tnum text-[13px] ${
                toneVal === null ? "text-ink" : deltaToneClass(toneVal)
              }`}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TargetBullet({
  low,
  high,
  mean,
  price,
}: {
  low: number;
  high: number;
  mean: number;
  price: number;
}) {
  const min = Math.min(low > 0 ? low : price, price) * 0.97;
  const max = Math.max(high, price) * 1.03;
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="relative h-7">
      <div className="absolute top-1/2 h-[6px] w-full -translate-y-1/2 rounded-full bg-white/[0.05]" />
      {/* live-only tickers can report a mean target without a low/high range */}
      {low > 0 && high > low && (
        <motion.div
          className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-gradient-to-r from-vio/30 via-vio/50 to-vio/30"
          style={{ left: pos(low), right: `calc(100% - ${pos(high)})` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        />
      )}
      {/* mean target */}
      <motion.div
        className="absolute top-1/2 h-[18px] w-[2.5px] -translate-y-1/2 rounded-full bg-vio"
        style={{ left: pos(mean) }}
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: 1, scaleY: 1 }}
        transition={{ delay: 0.45 }}
        title={`mean target ${fmtUSD(mean)}`}
      />
      {/* current price */}
      <motion.div
        className="absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 -translate-x-1/2"
        style={{ left: pos(price) }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.55, type: "spring", stiffness: 300, damping: 18 }}
        title={`current ${fmtUSD(price)}`}
      >
        <div className="h-full w-full rounded-full border-2 border-mint bg-void shadow-[0_0_12px_rgba(94,234,212,0.5)]" />
      </motion.div>
    </div>
  );
}

function ratingClass(rating: string): string {
  if (rating.includes("Strong Buy")) return "text-mint";
  if (rating.includes("Buy")) return "text-pos";
  if (rating.includes("Sell")) return "text-neg";
  return "text-warn";
}
