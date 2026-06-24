"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Radar } from "@/components/charts/Radar";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TickerLogo } from "@/components/ui/TickerLogo";
import {
  LEAD_TAG,
  MODEL_ADD_WEIGHT,
  SUB_SCORE_LABEL,
  suggestionReport,
  type MarginalImpact,
  type PortfolioMetrics,
  type SubScoreId,
  type Suggestion,
  type SuggestionContext,
} from "@/lib/analytics/suggestions";
import { fmtMultiple, fmtPct, fmtUSDCompact } from "@/lib/format";
import { usePortfolio } from "@/lib/store";
import type { Fundamentals, Sector } from "@/lib/types";

const SECTOR_COLOR: Record<Sector, string> = {
  Technology: "#6ea8fe",
  "Communication Services": "#b58cff",
  "Consumer Discretionary": "#5ec8a8",
  "Consumer Staples": "#9bbf6b",
  Financials: "#e0b15e",
  "Health Care": "#5fb3c9",
  Industrials: "#9aa4b2",
  Energy: "#d98b6a",
  Materials: "#c9a06a",
  Utilities: "#7f9ad1",
  "Real Estate": "#c98aa6",
  Diversified: "#8fa0b5",
  Unknown: "#8a8f99",
};

const SECTOR_LABEL: Partial<Record<Sector, string>> = { Diversified: "ETFs & Funds" };
const sectorLabel = (s: Sector) => SECTOR_LABEL[s] ?? s;

const SECTOR_ORDER: Sector[] = [
  "Technology",
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Financials",
  "Health Care",
  "Industrials",
  "Energy",
  "Materials",
  "Utilities",
  "Real Estate",
  "Diversified",
  "Unknown",
];

const SUB_ORDER: SubScoreId[] = ["fit", "quality", "growth", "value", "momentum", "analyst"];

const tierColor = (s: number): string =>
  s >= 62
    ? "var(--color-mint)"
    : s >= 52
      ? "var(--color-sky)"
      : s >= 44
        ? "var(--color-warn)"
        : "var(--color-neg)";

const tierHex = (s: number): string =>
  s >= 62 ? "#4ade80" : s >= 52 ? "#6ea8fe" : s >= 44 ? "#fbbf78" : "#f87171";

type Filter = Sector | "all";

export default function DiscoverPage() {
  const { ready, portfolio } = usePortfolio();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const report = useMemo(
    () => (portfolio ? suggestionReport(portfolio) : null),
    [portfolio]
  );

  const sectorOptions = useMemo(() => {
    if (!report) return [];
    const counts = new Map<Sector, number>();
    for (const s of report.suggestions)
      counts.set(s.sector, (counts.get(s.sector) ?? 0) + 1);
    return SECTOR_ORDER.filter((s) => counts.has(s)).map((s) => ({
      sector: s,
      count: counts.get(s)!,
    }));
  }, [report]);

  const list = useMemo(() => {
    if (!report) return [];
    const l =
      filter === "all"
        ? report.suggestions
        : report.suggestions.filter((s) => s.sector === filter);
    return filter === "all" ? l.slice(0, 18) : l;
  }, [report, filter]);

  useEffect(() => {
    if (list.length === 0) return;
    if (!selected || !list.some((s) => s.symbol === selected)) {
      setSelected(list[0].symbol);
    }
  }, [list, selected]);

  const active = list.find((s) => s.symbol === selected) ?? list[0] ?? null;

  // Optional live overlay: implied upside to the analyst target. Display-only.
  const [prices, setPrices] = useState<Record<string, number>>({});
  const symbolKey = list.map((s) => s.symbol).sort().join(",");
  useEffect(() => {
    if (!symbolKey) return;
    let cancelled = false;
    fetch(`/api/quotes?symbols=${encodeURIComponent(symbolKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.quotes) return;
        const next: Record<string, number> = {};
        for (const k of Object.keys(d.quotes)) {
          const p = d.quotes[k]?.price;
          if (typeof p === "number") next[k] = p;
        }
        setPrices((prev) => ({ ...prev, ...next }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbolKey]);

  const pick = (sym: string) => {
    setSelected(sym);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    }
  };

  if (!ready) return null;
  if (!portfolio || !report) return <EmptyState page="The idea engine" />;

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio"
        title="Discover"
        description="Stocks worth adding — screened for standalone merit and ranked by how each would move your book's risk and return."
        right={<SectorSelect value={filter} options={sectorOptions} onChange={setFilter} />}
      />

      <PortfolioBar context={report.context} />

      {list.length === 0 || !active ? (
        <Card className="mt-2 px-8 py-12 text-center" hover={false}>
          <h2 className="font-display text-[15px] font-medium text-ink">
            No ideas in {filter === "all" ? "this view" : sectorLabel(filter)}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-mute">
            You already hold most of this universe. Try another sector.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(290px,340px)_1fr] lg:items-stretch lg:h-[calc(100dvh-244px)] lg:min-h-[640px]">
          {/* Master: ranked list */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="panel flex min-h-0 flex-col overflow-hidden p-1.5 lg:h-full"
          >
            <div className="flex items-center justify-between px-2.5 pb-1.5 pt-2">
              <span className="eyebrow">Ranked ideas</span>
              <span className="font-mono text-[10px] text-faint">{list.length}</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {list.map((s, i) => (
                <IdeaRow
                  key={s.symbol}
                  s={s}
                  rank={i + 1}
                  active={s.symbol === active.symbol}
                  onClick={() => pick(s.symbol)}
                />
              ))}
            </div>
          </motion.div>

          {/* Detail */}
          <div ref={detailRef} className="min-h-0 lg:h-full">
            <DetailPanel s={active} price={prices[active.symbol]} />
          </div>
        </div>
      )}

      <p className="mt-6 max-w-2xl text-[11px] leading-relaxed text-faint">
        Model-driven screens over a bundled universe — not investment advice.
        Conviction blends quality, growth, valuation, momentum and analyst
        posture with a portfolio-fit score. Portfolio impact reuses the Risk
        page&apos;s factor covariance and CAPM expected returns; implied upside,
        when shown, is the live price against the mean analyst target.
      </p>
    </div>
  );
}

/* --------------------------- portfolio snapshot bar --------------------------- */

function metricItems(m: PortfolioMetrics) {
  return [
    { label: "Exp. return", value: fmtPct(m.expectedReturn, 1) },
    { label: "Volatility", value: fmtPct(m.volatility, 1) },
    { label: "Sharpe", value: m.sharpe.toFixed(2) },
    { label: "Beta", value: m.beta.toFixed(2) },
    { label: "Eff. holdings", value: m.effectiveHoldings.toFixed(1) },
    { label: "Diversification", value: `${m.diversificationRatio.toFixed(2)}×` },
  ];
}

function PortfolioBar({ context }: { context: SuggestionContext }) {
  const gaps = context.gaps
    .filter((g) => g.gap > 0.02)
    .slice(0, 3)
    .map((g) => sectorLabel(g.sector));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.04 }}
      className="panel mb-4 px-4 py-3 sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint/30" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
          </span>
          <span className="eyebrow">Your book</span>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2.5">
          {metricItems(context.metrics).map((it) => (
            <div key={it.label} className="flex items-baseline gap-2">
              <span className="font-mono text-[9.5px] uppercase tracking-wide text-faint">
                {it.label}
              </span>
              <span className="font-mono tnum text-[13px] text-ink">{it.value}</span>
            </div>
          ))}
        </div>

        {gaps.length > 0 && (
          <div className="hidden items-baseline gap-2 xl:flex">
            <span className="font-mono text-[9.5px] uppercase tracking-wide text-faint">
              Lightest
            </span>
            <span className="text-[12px] text-mute">{gaps.join(" · ")}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------- master row ------------------------------- */

function IdeaRow({
  s,
  rank,
  active,
  onClick,
}: {
  s: Suggestion;
  rank: number;
  active: boolean;
  onClick: () => void;
}) {
  const accent = tierColor(s.score);
  return (
    <button
      onClick={onClick}
      className="relative flex shrink-0 items-center gap-3 rounded-lg px-2.5 py-2.5 text-left"
    >
      {active && (
        <motion.span
          layoutId="discover-active"
          className="absolute inset-0 rounded-lg bg-white/[0.06] ring-1 ring-inset ring-white/[0.06]"
          transition={{ type: "spring", stiffness: 520, damping: 40 }}
        />
      )}
      <span
        className={`relative z-10 w-4 shrink-0 text-center font-mono text-[10.5px] ${
          active ? "text-mute" : "text-faint"
        }`}
      >
        {rank}
      </span>
      <span className="relative z-10">
        <TickerLogo symbol={s.symbol} accent={accent} size={30} />
      </span>
      <span className="relative z-10 min-w-0 flex-1">
        <span className="block font-mono text-[13px] font-semibold text-ink">{s.symbol}</span>
        <span className="block truncate text-[10.5px] text-faint">{s.fundamentals.name}</span>
      </span>
      <span className="relative z-10 flex shrink-0 items-center gap-2">
        <span className="h-7 w-1 rounded-full" style={{ background: accent, opacity: active ? 1 : 0.4 }} />
        <span
          className="w-7 text-right font-display text-[17px] font-bold leading-none"
          style={{ color: accent }}
        >
          {Math.round(s.score)}
        </span>
      </span>
    </button>
  );
}

/* ------------------------------ detail panel ------------------------------ */

function pegOf(f: Fundamentals): string {
  if (!f.forwardPE || f.forwardPE <= 0 || f.epsGrowth <= 0) return "—";
  return (f.forwardPE / (f.epsGrowth * 100)).toFixed(2);
}

function DetailPanel({ s, price }: { s: Suggestion; price?: number }) {
  const accent = tierColor(s.score);
  const hex = tierHex(s.score);
  const f = s.fundamentals;
  const up = price && price > 0 && s.priceTarget ? s.priceTarget / price - 1 : null;

  const funda: { label: string; value: string }[] = [
    { label: "Fwd P/E", value: fmtMultiple(f.forwardPE) },
    { label: "PEG", value: pegOf(f) },
    { label: "Rev growth", value: fmtPct(f.revenueGrowth, 0) },
    { label: "EPS growth", value: fmtPct(f.epsGrowth, 0) },
    { label: "FCF yield", value: fmtPct(f.fcfYield, 1) },
    { label: "ROIC", value: fmtPct(f.roic, 0) },
    { label: "Op margin", value: fmtPct(f.operatingMargin, 0) },
    { label: "Gross margin", value: fmtPct(f.grossMargin, 0) },
    { label: "Beta", value: f.beta.toFixed(2) },
    { label: "Volatility", value: fmtPct(f.volatility, 0) },
    { label: "Div yield", value: f.dividendYield > 0 ? fmtPct(f.dividendYield, 1) : "—" },
    { label: "Mkt cap", value: fmtUSDCompact(f.marketCap) },
  ];

  return (
    <motion.section
      key={s.symbol}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="panel flex min-h-0 flex-col overflow-hidden lg:h-full"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Header band */}
        <div
          className="relative px-6 pb-5 pt-6 sm:px-8"
          style={{
            background: `radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, ${accent} 9%, transparent), transparent 60%)`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <TickerLogo symbol={s.symbol} accent={accent} size={46} />
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[19px] font-semibold text-ink">{s.symbol}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                      color: accent,
                    }}
                  >
                    {LEAD_TAG[s.lead]}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-mute">{f.name}</div>
                <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
                  {sectorLabel(s.sector)} · {f.industry}
                </div>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className="eyebrow">conviction</div>
              <div className="font-display text-[40px] font-bold leading-none" style={{ color: accent }}>
                <AnimatedNumber value={s.score} from={0} format={(v) => `${Math.round(v)}`} />
              </div>
              <div className="font-mono text-[10px] text-faint">/ 100</div>
            </div>
          </div>
        </div>

        <div className="grid gap-x-8 gap-y-6 px-6 pb-2 sm:px-8 lg:grid-cols-[248px_1fr]">
          {/* Radar profile vs the market baseline */}
          <div className="flex flex-col items-center">
            <Radar
              size={248}
              axes={SUB_ORDER.map((id) => SUB_SCORE_LABEL[id])}
              series={[
                {
                  id: "market",
                  label: "Market avg",
                  color: "#5b6472",
                  values: SUB_ORDER.map(() => 50),
                  fillOpacity: 0.04,
                },
                {
                  id: "cand",
                  label: s.symbol,
                  color: hex,
                  values: SUB_ORDER.map((id) => Math.round(s.subScores[id])),
                  fillOpacity: 0.16,
                },
              ]}
            />
          </div>

          {/* Why */}
          <div className="min-w-0">
            <div className="eyebrow mb-2">Why it&apos;s on the list</div>
            <ul className="space-y-2 border-l border-edge pl-4">
              {s.reasons.map((r, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.07, duration: 0.35 }}
                  className="text-[13px] leading-relaxed text-mute"
                >
                  {r.text}.
                </motion.li>
              ))}
            </ul>
          </div>
        </div>

        {/* Fundamentals grid */}
        <div className="px-6 pb-1 pt-3 sm:px-8">
          <div className="eyebrow mb-3">Fundamentals</div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-3.5 sm:grid-cols-4 lg:grid-cols-6">
            {funda.map((st) => (
              <div key={st.label}>
                <div className="font-mono text-[9px] uppercase tracking-wide text-faint">{st.label}</div>
                <div className="mt-0.5 font-mono tnum text-[13.5px] text-ink">{st.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Portfolio impact */}
        <div className="px-6 pb-6 pt-5 sm:px-8">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="eyebrow">Portfolio impact</span>
            <span className="font-mono text-[10px] text-faint">
              if you add a {fmtPct(MODEL_ADD_WEIGHT, 0)} position
            </span>
          </div>
          <ImpactGrid impact={s.impact} />
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge px-6 py-4 sm:px-8">
          <span className="font-mono text-[10.5px] text-faint">
            {s.rating} · mean target {targetText(s.priceTarget)}
            {up !== null && (
              <>
                {" "}
                ·{" "}
                <span className={up >= 0 ? "text-pos" : "text-neg"}>
                  {up >= 0 ? "+" : ""}
                  {fmtPct(up, 0)} implied
                </span>
              </>
            )}{" "}
            · {f.analyst.count} analysts
          </span>
          <Link
            href={`/research?symbol=${s.symbol}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-edge2 hover:bg-white/[0.05]"
          >
            Open in Research <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </motion.section>
  );
}

/* ------------------------------ impact grid ------------------------------ */

type Dir = "up" | "down" | "neutral";

function ImpactGrid({ impact }: { impact: MarginalImpact }) {
  const { before, after } = impact;
  const rows: {
    label: string;
    before: string;
    after: string;
    delta: number;
    deltaText: string;
    better: Dir;
  }[] = [
    {
      label: "Exp. return",
      before: fmtPct(before.expectedReturn, 1),
      after: fmtPct(after.expectedReturn, 1),
      delta: impact.dExpectedReturn,
      deltaText: signedPp(impact.dExpectedReturn),
      better: "up",
    },
    {
      label: "Volatility",
      before: fmtPct(before.volatility, 1),
      after: fmtPct(after.volatility, 1),
      delta: impact.dVolatility,
      deltaText: signedPp(impact.dVolatility),
      better: "down",
    },
    {
      label: "Sharpe",
      before: before.sharpe.toFixed(2),
      after: after.sharpe.toFixed(2),
      delta: impact.dSharpe,
      deltaText: signed(impact.dSharpe, 2),
      better: "up",
    },
    {
      label: "Beta",
      before: before.beta.toFixed(2),
      after: after.beta.toFixed(2),
      delta: impact.dBeta,
      deltaText: signed(impact.dBeta, 2),
      better: "neutral",
    },
    {
      label: "Eff. holdings",
      before: before.effectiveHoldings.toFixed(1),
      after: after.effectiveHoldings.toFixed(1),
      delta: impact.dEffectiveHoldings,
      deltaText: signed(impact.dEffectiveHoldings, 1),
      better: "up",
    },
    {
      label: "Diversification",
      before: `${before.diversificationRatio.toFixed(2)}×`,
      after: `${after.diversificationRatio.toFixed(2)}×`,
      delta: impact.dDiversificationRatio,
      deltaText: signed(impact.dDiversificationRatio, 2),
      better: "up",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {rows.map((r, i) => {
        const tone = toneOf(r.delta, r.better);
        return (
          <motion.div
            key={r.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.05, duration: 0.35 }}
            className="rounded-xl border border-edge bg-white/[0.015] px-3 py-2.5"
          >
            <div className="font-mono text-[9px] uppercase tracking-wide text-faint">{r.label}</div>
            <div className="mt-1.5 flex items-baseline gap-1.5 font-mono tnum">
              <span className="text-[12px] text-faint">{r.before}</span>
              <span className="text-[10px] text-edge2">→</span>
              <span className="text-[14px] text-ink">{r.after}</span>
            </div>
            <div className={`mt-0.5 font-mono text-[10px] ${tone.cls}`}>
              {tone.arrow} {r.deltaText}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function toneOf(delta: number, better: Dir): { cls: string; arrow: string } {
  const eps = 1e-6;
  if (better === "neutral" || Math.abs(delta) < eps)
    return { cls: "text-mute", arrow: delta > eps ? "▲" : delta < -eps ? "▼" : "·" };
  const good = better === "up" ? delta > 0 : delta < 0;
  return {
    cls: good ? "text-pos" : "text-neg",
    arrow: delta > 0 ? "▲" : "▼",
  };
}

const signed = (x: number, d: number) => `${x >= 0 ? "+" : ""}${x.toFixed(d)}`;
const signedPp = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}pp`;

function targetText(t: number): string {
  return t >= 1000 ? `$${(t / 1000).toFixed(1)}k` : `$${Math.round(t)}`;
}

/* ----------------------------- sector select ----------------------------- */

function SectorSelect({
  value,
  options,
  onChange,
}: {
  value: Filter;
  options: { sector: Sector; count: number }[];
  onChange: (f: Filter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const total = options.reduce((s, o) => s + o.count, 0);
  const selected = value === "all" ? null : value;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-lg border border-edge bg-white/[0.03] pl-3 pr-2.5 text-[13px] text-ink transition-colors hover:border-edge2"
      >
        <span className="text-mute">Sector</span>
        <span className="font-medium">{selected ? sectorLabel(selected) : "All"}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M5 7.5 L10 12.5 L15 7.5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 z-50 mt-1.5 max-h-[60vh] w-56 overflow-y-auto rounded-xl border border-edge bg-[#0a0a0a] p-1.5 shadow-2xl shadow-black/60"
          >
            <SelectRow
              label="All ideas"
              count={total}
              active={value === "all"}
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
            />
            <div className="my-1 h-px bg-edge" />
            {options.map((o) => (
              <SelectRow
                key={o.sector}
                label={sectorLabel(o.sector)}
                count={o.count}
                color={SECTOR_COLOR[o.sector]}
                active={value === o.sector}
                onClick={() => {
                  onChange(o.sector);
                  setOpen(false);
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SelectRow({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
        active ? "bg-white/[0.07] text-ink" : "text-mute hover:bg-white/[0.04] hover:text-ink"
      }`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color ?? "var(--color-faint)" }} />
      <span className="flex-1 truncate">{label}</span>
      <span className="font-mono tnum text-[11px] text-faint">{count}</span>
    </button>
  );
}
