"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, m } from "framer-motion";
import { TickerSearch } from "@/components/research/TickerSearch";

// Rendered only once price history has loaded; deferred so the search box and
// fundamentals paint without the chart's JS in the initial route bundle.
const PriceChart = dynamic(
  () => import("@/components/charts/PriceChart").then((m) => m.PriceChart),
  { ssr: false }
);
import { Card, CardHeader } from "@/components/ui/Card";
import { deltaToneClass } from "@/components/ui/Delta";
import { PageHeader } from "@/components/ui/PageHeader";
import { TickerLogo } from "@/components/ui/TickerLogo";
import { Tooltip } from "@/components/ui/Tooltip";
import { factorScores } from "@/lib/analytics/factors";
import { SPX } from "@/lib/data/benchmarks";
import {
  daysUntil,
  fmtDate,
  fmtMultiple,
  fmtPct,
  fmtShares,
  fmtUSD,
  fmtUSDCompact,
  relativeTime,
} from "@/lib/format";
import type { HistoryRange } from "@/lib/research/types";
import {
  useResearchTarget,
  usePriceHistory,
  type ResearchTarget,
} from "@/lib/research/useResearch";
import { usePortfolio } from "@/lib/store";
import type { AnalystRating, Fundamentals, Position } from "@/lib/types";

const RANGES: { id: HistoryRange; label: string }[] = [
  { id: "1m", label: "1M" },
  { id: "6m", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "5y", label: "5Y" },
];

const STARTER_TICKERS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "SPY"];

export default function ResearchPage() {
  const { ready, portfolio } = usePortfolio();
  const [symbol, setSymbol] = useState<string | null>(null);
  const [range, setRange] = useState<HistoryRange>("1y");
  const [touched, setTouched] = useState(false);

  // A ?symbol= deep-link wins over the default and counts as a deliberate pick
  // so the largest-holding default doesn't clobber it.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("symbol");
    if (q) {
      setTouched(true);
      setSymbol(q.toUpperCase());
    }
  }, []);

  // Default to the largest holding once the portfolio loads, unless the user
  // has already picked a ticker themselves.
  const defaultSymbol = portfolio?.positions[0]?.symbol ?? null;
  useEffect(() => {
    if (!touched && defaultSymbol) setSymbol(defaultSymbol);
  }, [touched, defaultSymbol]);

  const select = (s: string) => {
    setTouched(true);
    setSymbol(s);
  };

  const holding = useMemo(
    () => portfolio?.positions.find((p) => p.symbol === symbol) ?? null,
    [portfolio, symbol]
  );

  const portfolioIncome = useMemo(() => {
    if (!portfolio) return 0;
    return portfolio.positions.reduce(
      (s, p) => s + p.equity * (p.fundamentals?.dividendYield ?? 0),
      0
    );
  }, [portfolio]);

  if (!ready) return null;

  const picks = portfolio?.positions.map((p) => p.symbol) ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Research"
        title="Research"
        description="Look up any stock, ETF or fund — live price history, fundamentals, and how it stacks up against the S&P 500."
      />

      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-5"
      >
        <TickerSearch onSelect={select} />
      </m.div>

      <QuickPicks
        label={picks.length > 0 ? "Your holdings" : "Popular"}
        symbols={picks.length > 0 ? picks : STARTER_TICKERS}
        active={symbol}
        positions={portfolio?.positions ?? []}
        onSelect={select}
      />

      {symbol ? (
        <AnimatePresence mode="wait">
          <m.div
            key={symbol}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <ResearchView
              symbol={symbol}
              range={range}
              onRange={setRange}
              holding={holding}
              portfolioIncome={portfolioIncome}
            />
          </m.div>
        </AnimatePresence>
      ) : (
        <Card className="mt-8 px-8 py-12 text-center">
          <h2 className="font-display text-lg font-semibold text-ink">
            Search any ticker to begin
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-mute">
            Type a symbol or company name above. No portfolio required —
            research works for any security, with live market data when
            available.
          </p>
        </Card>
      )}
    </div>
  );
}

function QuickPicks({
  label,
  symbols,
  active,
  positions,
  onSelect,
}: {
  label: string;
  symbols: string[];
  active: string | null;
  positions: Position[];
  onSelect: (s: string) => void;
}) {
  if (symbols.length === 0) return null;
  const bySymbol = new Map(positions.map((p) => [p.symbol, p]));
  return (
    <div className="mb-6">
      <div className="eyebrow mb-2">{label}</div>
      <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {symbols.map((s) => {
          const p = bySymbol.get(s);
          const isActive = s === active;
          return (
            <button
              key={s}
              onClick={() => onSelect(s)}
              className={`shrink-0 rounded-xl border px-3.5 py-2 text-left transition-colors ${
                isActive
                  ? "border-mint/35 bg-mint/[0.08]"
                  : "border-edge bg-panel hover:border-edge2"
              }`}
            >
              <div
                className={`font-mono text-[13px] font-medium ${
                  isActive ? "text-mint" : "text-ink"
                }`}
              >
                {s}
              </div>
              {p ? (
                <div
                  className={`font-mono tnum text-[11px] ${deltaToneClass(p.returnPct)}`}
                >
                  {fmtPct(p.returnPct, 1, true)}
                </div>
              ) : (
                <div className="font-mono text-[11px] text-faint">look up</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResearchView({
  symbol,
  range,
  onRange,
  holding,
  portfolioIncome,
}: {
  symbol: string;
  range: HistoryRange;
  onRange: (r: HistoryRange) => void;
  holding: Position | null;
  portfolioIncome: number;
}) {
  const target = useResearchTarget(symbol);
  const { data: history, loading: histLoading } = usePriceHistory(symbol, range);
  const f = target.fundamentals;

  // Price resolution, most-trusted first: live quote → live-priced holding →
  // latest charted close. Lets research work even when one feed is down.
  const lastClose = history?.points[history.points.length - 1]?.c ?? null;
  const price = target.quote?.price ?? holding?.price ?? lastClose ?? null;
  const prevClose = target.quote?.prevClose ?? null;
  const dayChangePct =
    price !== null && prevClose && prevClose > 0 ? price / prevClose - 1 : null;

  const periodReturn =
    history && history.points.length >= 2
      ? history.points[history.points.length - 1].c / history.points[0].c - 1
      : null;

  if (target.loading && !f) {
    return (
      <div className="mt-10 text-center font-mono text-[12px] text-mute">
        Loading {symbol}…
      </div>
    );
  }

  if (target.notFound || !f) {
    return (
      <Card className="mt-8 px-8 py-12 text-center">
        <h2 className="font-display text-lg font-semibold text-ink">
          No data for {symbol}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-mute">
          We could not find a security matching that ticker. Check the symbol
          and try again.
        </p>
      </Card>
    );
  }

  const upside = price !== null && f.analyst.priceTarget > 0
    ? f.analyst.priceTarget / price - 1
    : null;
  const scores = factorScores(f);
  const factorRows: [string, number, number, string][] = [
    ["Growth", scores.growth, SPX.factorScores.growth, "var(--color-mint)"],
    ["Value", scores.value, SPX.factorScores.value, "var(--color-vio)"],
    ["Quality", scores.quality, SPX.factorScores.quality, "var(--color-sky)"],
    ["Momentum", scores.momentum, SPX.factorScores.momentum, "var(--color-warn)"],
  ];

  return (
    <div className="space-y-5">
      {/* Hero: identity, price, chart */}
      <Card className="px-6 py-5" i={0}>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <TickerLogo symbol={symbol} accent="var(--color-mint)" size={48} />
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-display text-[22px] font-semibold leading-tight text-ink">
                  {f.name}
                </h2>
                <span className="rounded-md border border-edge bg-void/50 px-2 py-0.5 font-mono text-[11px] text-mute">
                  {symbol}
                </span>
              </div>
              <div className="mt-1 text-[12px] text-faint">
                {f.sector}
                {f.industry && f.industry !== "Unknown"
                  ? ` · ${f.industry}`
                  : ""}
                {f.marketCap > 0 ? ` · ${fmtUSDCompact(f.marketCap)} mkt cap` : ""}
              </div>
              <ProvenanceBadge target={target} />
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono tnum text-[26px] leading-none text-ink">
              {price !== null ? fmtUSD(price) : "—"}
            </div>
            {dayChangePct !== null && (
              <div
                className={`mt-1 font-mono tnum text-[12px] ${deltaToneClass(dayChangePct)}`}
              >
                {fmtPct(dayChangePct, 2, true)} today
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => onRange(r.id)}
                className={`rounded-lg px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  r.id === range
                    ? "bg-white/[0.08] text-ink"
                    : "text-faint hover:text-mute"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {periodReturn !== null && (
            <span
              className={`font-mono tnum text-[12px] ${deltaToneClass(periodReturn)}`}
            >
              {fmtPct(periodReturn, 1, true)} · {range.toUpperCase()}
            </span>
          )}
        </div>

        <div className="mt-3">
          {history ? (
            <PriceChart
              points={history.points}
              range={range}
              currency={history.currency}
            />
          ) : (
            <div className="flex h-[260px] items-center justify-center font-mono text-[12px] text-faint">
              {histLoading
                ? "Loading price history…"
                : "No price history available"}
            </div>
          )}
        </div>
      </Card>

      {/* Position context (holdings only) — your lot, plus a deeper read beside it */}
      {holding && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="px-6 py-4" i={1}>
            <div className="eyebrow mb-3">Your position</div>
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <MiniStat
                label="Value"
                value={fmtUSD(holding.equity)}
                sub={`${fmtPct(holding.weight, 1)} of portfolio`}
              />
              <MiniStat
                label="Shares"
                value={fmtShares(holding.shares)}
                sub={`avg ${fmtUSD(holding.averageCost)}`}
              />
              <MiniStat
                label="Unrealized P&L"
                value={`${holding.totalReturn >= 0 ? "+" : ""}${fmtUSD(holding.totalReturn)}`}
                sub={`${fmtPct(holding.returnPct, 2, true)} on cost`}
                tone={holding.returnPct}
              />
            </div>
          </Card>

          <Card className="px-6 py-4" i={1}>
            <div className="eyebrow mb-3">Position detail</div>
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <MiniStat
                label="Cost basis"
                value={fmtUSD(holding.costBasis)}
                sub={`${fmtShares(holding.shares)} sh @ ${fmtUSD(holding.averageCost)}`}
              />
              {(() => {
                const dc = holding.dayChange;
                const denom = holding.equity - (dc ?? 0);
                const dcPct = dc !== null && denom > 0 ? dc / denom : null;
                return (
                  <MiniStat
                    label="Day's change"
                    value={
                      dc === null
                        ? "—"
                        : `${dc >= 0 ? "+" : "−"}${fmtUSD(Math.abs(dc))}`
                    }
                    sub={dcPct !== null ? fmtPct(dcPct, 2, true) : "no live quote"}
                    tone={dc ?? undefined}
                  />
                );
              })()}
              <MiniStat
                label="Est. annual income"
                value={
                  f.dividendYield > 0
                    ? fmtUSD(holding.equity * f.dividendYield)
                    : "—"
                }
                sub={
                  f.dividendYield > 0
                    ? `${fmtPct(f.dividendYield, 2)} yield`
                    : "no dividend"
                }
                accent={f.dividendYield > 0 ? "text-mint" : undefined}
              />
            </div>
          </Card>
        </div>
      )}

      {/* Analyst price target */}
      {price !== null && f.analyst.priceTarget > 0 && (
        <Card className="px-6 py-5" i={2}>
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
            price={price}
          />
          <div className="mt-2 flex justify-between font-mono tnum text-[11px] text-mute">
            <span>low {fmtUSD(f.analyst.targetLow)}</span>
            <span>
              now {fmtUSD(price)} ·{" "}
              {upside !== null && (
                <span className={deltaToneClass(upside)}>
                  {fmtPct(upside, 1, true)} to mean
                </span>
              )}
            </span>
            <span>high {fmtUSD(f.analyst.targetHigh)}</span>
          </div>
        </Card>
      )}

      {/* Fundamentals vs the S&P 500 */}
      <div className="grid gap-5 lg:grid-cols-3">
        <CompareCard
          i={3}
          title="Growth"
          rows={[
            row("Revenue growth", f.revenueGrowth, SPX.revenueGrowth, true, pctSigned),
            row("EPS growth", f.epsGrowth, SPX.epsGrowth, true, pctSigned),
            row("FCF growth", f.fcfGrowth, SPX.fcfGrowth, true, pctSigned, !target.bundled),
            row("12-month return", f.return12m, SPX.return12m, true, pctSigned),
          ]}
        />
        <CompareCard
          i={4}
          title="Valuation"
          rows={[
            row("Forward P/E", f.forwardPE, SPX.forwardPE, false, (v) => fmtMultiple(v)),
            row("FCF yield", f.fcfYield, SPX.fcfYield, true, (v) => fmtPct(v, 1)),
            row("Dividend yield", f.dividendYield, SPX.dividendYield, true, (v) => fmtPct(v, 2)),
            row(
              "PEG ratio",
              peg(f.forwardPE, f.epsGrowth),
              peg(SPX.forwardPE, SPX.epsGrowth) ?? 0,
              false,
              (v) => v.toFixed(2)
            ),
          ]}
        />
        <CompareCard
          i={5}
          title="Quality"
          rows={[
            row("ROIC", f.roic, SPX.roic, true, (v) => fmtPct(v, 1), !target.bundled),
            row("Operating margin", f.operatingMargin, SPX.operatingMargin, true, (v) => fmtPct(v, 1)),
            row("Gross margin", f.grossMargin, SPX.grossMargin, true, (v) => fmtPct(v, 1)),
            row("Beta", f.beta, SPX.beta, false, (v) => v.toFixed(2)),
          ]}
        />
      </div>

      {/* Style factors vs the S&P 500 */}
      <Card className="px-6 py-5" i={6}>
        <CardHeader
          eyebrow="Style profile"
          title={`How ${symbol} loads on the four factors`}
          right={
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-faint">
              tick = S&P 500
            </span>
          }
          className="mb-5"
        />
        <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
          {factorRows.map(([label, score, bench, color], idx) => (
            <div key={label} className="flex items-center gap-4">
              <span className="w-20 font-mono text-[11px] uppercase tracking-wider text-mute">
                {label}
              </span>
              <div className="relative flex-1">
                <div className="h-[7px] w-full rounded-full bg-white/[0.05]" />
                <m.div
                  className="absolute top-0 h-[7px] rounded-full"
                  style={{
                    background: `linear-gradient(90deg, color-mix(in srgb, ${color} 30%, transparent), ${color})`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${score}%` }}
                  transition={{
                    duration: 0.9,
                    delay: 0.2 + idx * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
                <div
                  className="absolute top-1/2 h-[13px] w-[2px] -translate-y-1/2 rounded bg-white/80"
                  style={{ left: `${bench}%` }}
                  title={`S&P 500 · ${bench}`}
                />
              </div>
              <span className="w-10 text-right font-mono tnum text-[13px] text-ink">
                {Math.round(score)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 font-mono text-[10px] text-faint">
          0–100 · tick marks the S&P 500 profile
        </div>
      </Card>

      {/* Catalysts + dividends */}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <CatalystsCard f={f} i={7} />
        </div>
        <div className="lg:col-span-3">
          <DividendCard
            f={f}
            symbol={symbol}
            holding={holding}
            portfolioIncome={portfolioIncome}
            i={8}
          />
        </div>
      </div>
    </div>
  );
}

interface CompareRowData {
  label: string;
  stock: number | null;
  bench: number;
  higherBetter: boolean;
  fmt: (v: number) => string;
  estimated?: boolean;
}

function row(
  label: string,
  stock: number | null,
  bench: number,
  higherBetter: boolean,
  fmt: (v: number) => string,
  estimated = false
): CompareRowData {
  return { label, stock, bench, higherBetter, fmt, estimated };
}

const pctSigned = (v: number) => fmtPct(v, 1, true);

function peg(forwardPE: number | null, epsGrowth: number): number | null {
  if (!forwardPE || forwardPE <= 0 || epsGrowth <= 0) return null;
  return forwardPE / (epsGrowth * 100);
}

function CompareCard({
  title,
  rows,
  i,
}: {
  title: string;
  rows: CompareRowData[];
  i: number;
}) {
  return (
    <Card className="px-5 py-4" i={i}>
      <div className="mb-4 flex items-baseline justify-between">
        <div className="eyebrow">{title}</div>
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-faint">
          vs S&P 500
        </span>
      </div>
      <div className="space-y-4">
        {rows.map((r) => (
          <CompareRow key={r.label} {...r} />
        ))}
      </div>
    </Card>
  );
}

function CompareRow({
  label,
  stock,
  bench,
  higherBetter,
  fmt,
  estimated,
}: CompareRowData) {
  const has = stock !== null && Number.isFinite(stock);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-mute">
          {label}
          {estimated && (
            <span className="ml-1 font-mono text-[8.5px] uppercase tracking-wider text-faint">
              est
            </span>
          )}
        </span>
        <span className="whitespace-nowrap">
          <span className="font-mono tnum text-[13px] text-ink">
            {has ? fmt(stock as number) : "—"}
          </span>
          <span className="ml-2 font-mono tnum text-[11px] text-faint">
            vs {fmt(bench)}
          </span>
        </span>
      </div>
      {has && (
        <CompareBar
          stock={stock as number}
          bench={bench}
          higherBetter={higherBetter}
        />
      )}
    </div>
  );
}

function CompareBar({
  stock,
  bench,
  higherBetter,
}: {
  stock: number;
  bench: number;
  higherBetter: boolean;
}) {
  const lo = Math.min(0, stock, bench);
  const hi = Math.max(0, stock, bench);
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;
  const beat = higherBetter ? stock >= bench : stock <= bench;
  const color = beat ? "var(--color-pos)" : "var(--color-neg)";
  const zero = pos(0);
  const sx = pos(stock);
  const left = Math.min(zero, sx);
  const width = Math.abs(sx - zero);
  return (
    <div className="relative mt-2 h-[5px] w-full rounded-full bg-white/[0.05]">
      <div
        className="absolute top-0 h-[5px] rounded-full"
        style={{ left: `${left}%`, width: `${width}%`, background: color, opacity: 0.8 }}
      />
      <div
        className="absolute top-1/2 h-[11px] w-[2px] -translate-y-1/2 rounded bg-white/80"
        style={{ left: `${pos(bench)}%` }}
      />
    </div>
  );
}

function CatalystsCard({ f, i }: { f: Fundamentals; i: number }) {
  const earningsDays = daysUntil(f.earningsDate);
  return (
    <Card className="h-full px-5 py-4" i={i}>
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
  );
}

function DividendCard({
  f,
  symbol,
  holding,
  portfolioIncome,
  i,
}: {
  f: Fundamentals;
  symbol: string;
  holding: Position | null;
  portfolioIncome: number;
  i: number;
}) {
  if (f.dividendYield <= 0) {
    return (
      <Card className="h-full px-6 py-5" i={i}>
        <CardHeader
          eyebrow="Dividend analysis"
          title={`${symbol} does not pay a dividend`}
          className="mb-3"
        />
        <p className="text-[12.5px] leading-relaxed text-mute">
          All shareholder return here comes from price appreciation.
        </p>
      </Card>
    );
  }

  const per10k = 10_000 * f.dividendYield;
  const fcfPayout = f.fcfYield > 0 ? f.dividendYield / f.fcfYield : null;
  const stretched = fcfPayout !== null && fcfPayout > 0.8;

  const fields: {
    label: string;
    value: string;
    sub: string;
    accent?: string;
    subClass?: string;
  }[] = [
    {
      label: "Dividend yield",
      value: fmtPct(f.dividendYield, 2),
      sub: `S&P 500 ≈ ${fmtPct(SPX.dividendYield, 2)}`,
      subClass:
        f.dividendYield >= SPX.dividendYield ? "text-pos" : "text-faint",
    },
    {
      label: "Income / $10k",
      value: fmtUSD(per10k),
      sub: `≈ ${fmtUSD(per10k / 12)}/mo`,
      accent: "text-mint",
    },
    {
      label: "FCF payout",
      value: fcfPayout !== null ? fmtPct(Math.min(fcfPayout, 2), 0) : "n/m",
      sub: "of free cash flow",
      accent: stretched ? "text-warn" : undefined,
    },
  ];

  if (holding) {
    const income = holding.equity * f.dividendYield;
    fields.push({
      label: "Your income",
      value: fmtUSD(income),
      sub:
        portfolioIncome > 0
          ? `${fmtPct(income / portfolioIncome, 1)} of portfolio`
          : "from this holding",
    });
  }

  return (
    <Card className="h-full px-6 py-5" i={i}>
      <CardHeader
        eyebrow="Dividend analysis"
        title={`What ${symbol} pays`}
        className="mb-4"
      />
      <div
        className={`grid grid-cols-2 gap-6 ${
          fields.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
        }`}
      >
        {fields.map((field) => (
          <div key={field.label}>
            <div className="eyebrow">{field.label}</div>
            <div
              className={`mt-1 font-mono tnum text-[21px] ${field.accent ?? "text-ink"}`}
            >
              {field.value}
            </div>
            <div className={`font-mono text-[11px] ${field.subClass ?? "text-faint"}`}>
              {field.sub}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-edge pt-3 text-[11.5px] leading-relaxed text-faint">
        {stretched
          ? "Payout is consuming most of free cash flow — watch sustainability if growth stalls."
          : "Payout looks comfortably covered by free cash flow."}
      </p>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  sub,
  tone,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: number;
  /** Override the value color when there's no signed tone (e.g. income). */
  accent?: string;
}) {
  const valueClass =
    tone !== undefined ? deltaToneClass(tone) : accent ?? "text-ink";
  const subClass = tone !== undefined ? deltaToneClass(tone) : "text-faint";
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`mt-1 font-mono tnum text-[17px] ${valueClass}`}>
        {value}
      </div>
      <div className={`font-mono text-[11px] ${subClass}`}>{sub}</div>
    </div>
  );
}

function ProvenanceBadge({ target }: { target: ResearchTarget }) {
  const hasQuote = target.quote !== null;
  // Coverage of the *fundamentals* (per-field), independent of the live quote.
  const coverage = target.fundamentals?.provenance?.coverage ?? "fallback";
  const fundLive = coverage === "live";
  // The dot is green only when both the price and the critical fundamentals are
  // live — anything less is amber so a partial/snapshot read never looks live.
  const fullyLive = hasQuote && fundLive;

  const text = hasQuote
    ? fundLive
      ? `Live · ${target.asOf ? relativeTime(target.asOf) : "now"}`
      : "Live price · snapshot fundamentals"
    : target.live
      ? coverage === "partial"
        ? "Partial fundamentals"
        : "Live fundamentals"
      : target.bundled
        ? "Snapshot data"
        : "Limited data";

  const stale =
    coverage === "live"
      ? []
      : (["beta", "volatility", "sector"] as const).filter(
          (k) => target.fundamentals?.provenance?.fields[k] !== "live"
        );

  return (
    <Tooltip
      underline={false}
      maxWidth={240}
      content={
        <div className="space-y-1">
          <div>
            {fullyLive
              ? "Price and the risk-critical fundamentals come from a live provider."
              : "Some values fall back to the bundled snapshot and may be stale."}
          </div>
          {stale.length > 0 && (
            <div className="text-faint">From snapshot: {stale.join(", ")}</div>
          )}
        </div>
      }
    >
      <span className="mt-2 inline-flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${fullyLive ? "bg-pos" : "bg-warn"}`}
        />
        <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
          {text}
        </span>
      </span>
    </Tooltip>
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
      {low > 0 && high > low && (
        <m.div
          className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-gradient-to-r from-vio/30 via-vio/50 to-vio/30"
          style={{ left: pos(low), right: `calc(100% - ${pos(high)})` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        />
      )}
      <m.div
        className="absolute top-1/2 h-[18px] w-[2.5px] -translate-y-1/2 rounded-full bg-vio"
        style={{ left: pos(mean) }}
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: 1, scaleY: 1 }}
        transition={{ delay: 0.45 }}
        title={`mean target ${fmtUSD(mean)}`}
      />
      <m.div
        className="absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 -translate-x-1/2"
        style={{ left: pos(price) }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.55, type: "spring", stiffness: 300, damping: 18 }}
        title={`current ${fmtUSD(price)}`}
      >
        <div className="h-full w-full rounded-full border-2 border-mint bg-void shadow-[0_0_12px_rgba(176,43,10,0.5)]" />
      </m.div>
    </div>
  );
}

function ratingClass(rating: AnalystRating): string {
  if (rating.includes("Strong Buy")) return "text-mint";
  if (rating.includes("Buy")) return "text-pos";
  if (rating.includes("Sell")) return "text-neg";
  return "text-warn";
}
