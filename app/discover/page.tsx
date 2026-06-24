"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Meter } from "@/components/ui/Meter";
import { PageHeader } from "@/components/ui/PageHeader";
import { TickerLogo } from "@/components/ui/TickerLogo";
import {
  LEAD_TAG,
  SUB_SCORE_LABEL,
  suggestionReport,
  type SubScoreId,
  type Suggestion,
  type SuggestionContext,
} from "@/lib/analytics/suggestions";
import { fmtMultiple, fmtPct } from "@/lib/format";
import { usePortfolio } from "@/lib/store";
import type { Sector } from "@/lib/types";

/** Muted dots in the sector menu only — cards stay monochrome. */
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

const SECTOR_LABEL: Partial<Record<Sector, string>> = {
  Diversified: "ETFs & Funds",
};
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

/** Score → single accent, used sparingly. */
const tierColor = (s: number): string =>
  s >= 62
    ? "var(--color-mint)"
    : s >= 52
      ? "var(--color-sky)"
      : s >= 44
        ? "var(--color-warn)"
        : "var(--color-neg)";

type Filter = Sector | "all";

export default function DiscoverPage() {
  const { ready, portfolio } = usePortfolio();
  const [filter, setFilter] = useState<Filter>("all");

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

  const display = useMemo(() => {
    if (!report) return [];
    const list =
      filter === "all"
        ? report.suggestions
        : report.suggestions.filter((s) => s.sector === filter);
    return filter === "all" ? list.slice(0, 13) : list;
  }, [report, filter]);

  // Optional live overlay: implied upside to the analyst target. Display-only —
  // the ranking never depends on it, so the page degrades cleanly offline.
  const [prices, setPrices] = useState<Record<string, number>>({});
  const symbolKey = display.map((s) => s.symbol).sort().join(",");
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

  if (!ready) return null;
  if (!portfolio || !report) return <EmptyState page="The idea engine" />;

  const featured = display[0];
  const rest = display.slice(1);

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio"
        title="Discover"
        description="Stocks worth adding — screened for standalone merit and ranked by how well each fills the gaps in what you already own."
        right={
          <SectorSelect value={filter} options={sectorOptions} onChange={setFilter} />
        }
      />

      <ContextLine context={report.context} />

      {display.length === 0 ? (
        <Card className="mt-6 px-8 py-12 text-center" hover={false}>
          <h2 className="font-display text-[15px] font-medium text-ink">
            No ideas in {filter === "all" ? "this view" : sectorLabel(filter)}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-mute">
            You already hold most of this universe. Try another sector.
          </p>
        </Card>
      ) : (
        <>
          {featured && (
            <FeaturedCard key={featured.symbol} s={featured} price={prices[featured.symbol]} />
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {rest.map((s, i) => (
              <SuggestionRow key={s.symbol} s={s} rank={i + 2} i={i} price={prices[s.symbol]} />
            ))}
          </div>
        </>
      )}

      <p className="mt-8 max-w-2xl text-[11px] leading-relaxed text-faint">
        Model-driven screens over a bundled universe — not investment advice.
        Conviction blends quality, growth, valuation, momentum and analyst
        posture with a portfolio-fit score. Implied upside, when shown, is the
        live price against the mean analyst target.
      </p>
    </div>
  );
}

/* ------------------------------ context line ------------------------------ */

function ContextLine({ context }: { context: SuggestionContext }) {
  const gaps = context.gaps
    .filter((g) => g.gap > 0.02)
    .slice(0, 3)
    .map((g) => sectorLabel(g.sector));
  const concentrated = context.concentration > 0.14;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-mute"
    >
      <span className="text-faint">Tailored to your {context.heldSymbols.length} holdings.</span>
      {gaps.length > 0 && (
        <span>
          Lightest where it counts —{" "}
          <span className="text-ink">{gaps.join(", ")}</span>
          {concentrated && <span className="text-faint"> · concentrated book</span>}
        </span>
      )}
    </motion.div>
  );
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
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: color ?? "var(--color-faint)" }}
      />
      <span className="flex-1 truncate">{label}</span>
      <span className="font-mono tnum text-[11px] text-faint">{count}</span>
    </button>
  );
}

/* ------------------------------- pieces ------------------------------- */

/** Implied upside vs the mean analyst target, when a live price is in hand. */
function upsideText(price: number | undefined, target: number): string | null {
  if (!price || price <= 0 || !target) return null;
  const up = target / price - 1;
  return `${up >= 0 ? "+" : ""}${fmtPct(up, 0)} to target`;
}

/** Faint mono stat line: "Health Care · 18× · +12% to target". */
function StatLine({
  s,
  price,
  className = "",
}: {
  s: Suggestion;
  price?: number;
  className?: string;
}) {
  const up = upsideText(price, s.priceTarget);
  const parts = [
    sectorLabel(s.sector),
    `${fmtMultiple(s.fundamentals.forwardPE)} P/E`,
    s.rating,
  ];
  return (
    <div className={`flex flex-wrap items-center gap-x-2 font-mono text-[10.5px] text-faint ${className}`}>
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-edge2">·</span>}
          {p}
        </span>
      ))}
      {up && (
        <span className="flex items-center gap-2">
          <span className="text-edge2">·</span>
          <span className={up.startsWith("-") ? "text-neg" : "text-pos"}>{up}</span>
        </span>
      )}
    </div>
  );
}

const SUB_ORDER: SubScoreId[] = [
  "fit",
  "quality",
  "growth",
  "value",
  "momentum",
  "analyst",
];

/** The one rich exhibit — reserved for the featured pick. */
function ScoreBreakdown({ s }: { s: Suggestion }) {
  return (
    <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
      {SUB_ORDER.map((id, i) => {
        const v = Math.round(s.subScores[id]);
        const lead = id === s.lead;
        return (
          <div key={id} className="flex items-center gap-3">
            <span
              className={`w-16 shrink-0 text-[11px] ${lead ? "text-ink" : "text-mute"}`}
            >
              {SUB_SCORE_LABEL[id]}
            </span>
            <div className="flex-1">
              <Meter value={v} max={100} color={tierColor(v)} height={5} delay={0.25 + i * 0.05} />
            </div>
            <span className="w-6 shrink-0 text-right font-mono tnum text-[11px] text-mute">
              {v}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------- cards ------------------------------- */

function FeaturedCard({ s, price }: { s: Suggestion; price?: number }) {
  const accent = tierColor(s.score);
  return (
    <Card className="px-6 py-6 sm:px-7" i={0.4} hover={false}>
      <div className="grid gap-7 lg:grid-cols-[1fr_300px] lg:gap-10">
        {/* Left: the read */}
        <div className="min-w-0">
          <div className="flex items-start gap-3.5">
            <TickerLogo symbol={s.symbol} accent={accent} size={42} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-[17px] font-semibold text-ink">{s.symbol}</span>
                <span className="truncate text-[12.5px] text-mute">{s.fundamentals.name}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span
                  className="text-[10px] font-medium uppercase tracking-[0.1em]"
                  style={{ color: accent }}
                >
                  Top idea · {LEAD_TAG[s.lead]}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2.5 border-l border-edge pl-4">
            {s.reasons.slice(0, 2).map((r, i) => (
              <p key={i} className="text-[13px] leading-relaxed text-mute">
                {r.text}.
              </p>
            ))}
          </div>

          <StatLine s={s} price={price} className="mt-5" />
        </div>

        {/* Right: the score + breakdown */}
        <div className="lg:border-l lg:border-edge lg:pl-9">
          <div className="flex items-end justify-between">
            <div>
              <div className="eyebrow">conviction</div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-display text-[44px] font-bold leading-none"
                  style={{ color: accent }}
                >
                  {Math.round(s.score)}
                </span>
                <span className="font-mono text-[12px] text-faint">/100</span>
              </div>
            </div>
            <Link
              href={`/research?symbol=${s.symbol}`}
              className="font-mono text-[11px] text-sky transition-colors hover:text-ink"
            >
              Research →
            </Link>
          </div>

          <div className="mt-5">
            <ScoreBreakdown s={s} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function SuggestionRow({
  s,
  rank,
  i,
  price,
}: {
  s: Suggestion;
  rank: number;
  i: number;
  price?: number;
}) {
  const accent = tierColor(s.score);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 + i * 0.03, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/research?symbol=${s.symbol}`}
        className="group flex items-center gap-4 rounded-xl border border-edge bg-white/[0.012] px-4 py-3.5 transition-colors hover:border-edge2 hover:bg-white/[0.025]"
      >
        <span className="w-5 shrink-0 text-center font-mono text-[11px] text-faint">{rank}</span>
        <TickerLogo symbol={s.symbol} accent={accent} size={34} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[13.5px] font-semibold text-ink">{s.symbol}</span>
            <span className="truncate text-[11px] text-faint">{s.fundamentals.name}</span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-mute">{s.reasons[0]?.text}</p>
          <StatLine s={s} price={price} className="mt-1.5" />
        </div>

        <div className="shrink-0 text-right">
          <div
            className="font-display text-[22px] font-bold leading-none"
            style={{ color: accent }}
          >
            {Math.round(s.score)}
          </div>
          <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wide text-faint">
            {LEAD_TAG[s.lead].split(" ")[0]}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
