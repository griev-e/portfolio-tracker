"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Ring } from "@/components/ui/Ring";
import { TickerLogo } from "@/components/ui/TickerLogo";
import {
  LEAD_TAG,
  SUB_SCORE_LABEL,
  suggestionReport,
  type SubScoreId,
  type Suggestion,
  type SuggestionContext,
  type SuggestionReason,
} from "@/lib/analytics/suggestions";
import { fmtMultiple, fmtPct } from "@/lib/format";
import { usePortfolio } from "@/lib/store";
import type { Sector } from "@/lib/types";

/** Muted jewel tones, distinct enough to read sectors at a glance on near-black. */
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

/** Score → accent, aligned with the conviction bands. */
const tierColor = (s: number): string =>
  s >= 62
    ? "var(--color-mint)"
    : s >= 52
      ? "var(--color-sky)"
      : s >= 44
        ? "var(--color-warn)"
        : "var(--color-neg)";

const REASON_COLOR: Record<SuggestionReason["kind"], string> = {
  fit: "var(--color-sky)",
  quality: "var(--color-mint)",
  growth: "var(--color-pos)",
  value: "var(--color-warn)",
  momentum: "var(--color-sky)",
  analyst: "var(--color-vio)",
  income: "var(--color-mint)",
  insider: "var(--color-pos)",
};

type Filter = Sector | "all";

export default function DiscoverPage() {
  const { ready, portfolio } = usePortfolio();
  const [filter, setFilter] = useState<Filter>("all");

  const report = useMemo(
    () => (portfolio ? suggestionReport(portfolio) : null),
    [portfolio]
  );

  // Per-sector candidate counts for the dropdown, in canonical order.
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
    return filter === "all" ? list.slice(0, 18) : list;
  }, [report, filter]);

  // Optional live overlay: implied upside to the analyst target. Display-only —
  // the ranking never depends on it, so the page degrades cleanly when the
  // quote proxy is unavailable.
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
  if (!portfolio || !report)
    return <EmptyState page="The idea engine" />;

  const featured = display[0];
  const rest = display.slice(1);

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio"
        title="Discover"
        description="Stocks worth adding to your book — screened for standalone merit and ranked by how well each fills the gaps in what you already own."
        right={
          <SectorSelect
            value={filter}
            options={sectorOptions}
            onChange={setFilter}
          />
        }
      />

      <ContextStrip context={report.context} filter={filter} />

      {display.length === 0 ? (
        <Card className="mt-4 px-8 py-12 text-center" hover={false}>
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
            <FeaturedCard
              key={featured.symbol}
              s={featured}
              price={prices[featured.symbol]}
            />
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rest.map((s, i) => (
              <SuggestionCard
                key={s.symbol}
                s={s}
                i={i}
                price={prices[s.symbol]}
              />
            ))}
          </div>
        </>
      )}

      <p className="mt-6 text-[11px] leading-relaxed text-faint">
        Ideas are model-driven screens over a bundled universe, not investment
        advice. Conviction blends quality, growth, valuation, momentum and
        analyst posture with a portfolio-fit score; implied upside, when shown,
        is the live price against the mean analyst target.
      </p>
    </div>
  );
}

/* ------------------------------- context ------------------------------- */

function ContextStrip({
  context,
  filter,
}: {
  context: SuggestionContext;
  filter: Filter;
}) {
  const gaps = context.gaps.filter((g) => g.gap > 0.02).slice(0, 3);
  const effectiveNames = context.concentration > 0 ? 1 / context.concentration : 0;
  const concentrated = context.concentration > 0.14;

  return (
    <Card className="mb-4 px-5 py-4" i={0} hover={false}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="eyebrow mb-1">Tailored to your book</div>
          <p className="max-w-xl text-[12.5px] leading-relaxed text-mute">
            {concentrated ? (
              <>
                Your {context.heldSymbols.length} holdings are concentrated
                (~{effectiveNames.toFixed(0)} effective names) — diversifiers and
                under-owned sectors are weighted up.
              </>
            ) : (
              <>
                Ranked across {context.heldSymbols.length} holdings — names that
                fill your lighter sectors get a fit premium.
              </>
            )}
          </p>
        </div>

        {gaps.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[9.5px] uppercase tracking-wide text-faint">
              {filter === "all" ? "Biggest gaps vs S&P 500" : "Your sector gaps"}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {gaps.map((g) => (
                <span
                  key={g.sector}
                  className="flex items-center gap-1.5 rounded-full border border-edge bg-white/[0.02] px-2.5 py-1 text-[11px] text-mute"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: SECTOR_COLOR[g.sector] }}
                  />
                  {sectorLabel(g.sector)}
                  <span className="font-mono tnum text-[10px] text-faint">
                    −{fmtPct(g.gap, 0)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
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
        {selected && (
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: SECTOR_COLOR[selected] }}
          />
        )}
        <span className="text-mute">Sector</span>
        <span className="font-medium">
          {selected ? sectorLabel(selected) : "All ideas"}
        </span>
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
            className="absolute right-0 z-50 mt-1.5 max-h-[60vh] w-60 overflow-y-auto rounded-xl border border-edge bg-[#0a0a0a] p-1.5 shadow-2xl shadow-black/60"
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
        style={{ background: color ?? "var(--color-mute)" }}
      />
      <span className="flex-1 truncate">{label}</span>
      <span className="font-mono tnum text-[11px] text-faint">{count}</span>
    </button>
  );
}

/* ------------------------------ sub-scores ------------------------------ */

const SUB_ORDER: SubScoreId[] = [
  "quality",
  "growth",
  "value",
  "momentum",
  "analyst",
  "fit",
];

function SubScoreBars({
  scores,
  lead,
  delay = 0,
}: {
  scores: Record<SubScoreId, number>;
  lead: SubScoreId;
  delay?: number;
}) {
  return (
    <div className="flex items-end gap-1.5">
      {SUB_ORDER.map((id, i) => {
        const v = Math.round(scores[id]);
        const isLead = id === lead;
        return (
          <div
            key={id}
            className="flex flex-1 flex-col items-center gap-1"
            title={`${SUB_SCORE_LABEL[id]}: ${v}/100`}
          >
            <div className="flex h-10 w-full items-end overflow-hidden rounded bg-white/[0.04]">
              <motion.div
                className="w-full rounded"
                style={{
                  background: tierColor(v),
                  opacity: isLead ? 1 : 0.55,
                }}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(4, v)}%` }}
                transition={{ duration: 0.6, delay: delay + i * 0.04 }}
              />
            </div>
            <span
              className={`font-mono text-[8.5px] ${isLead ? "text-mute" : "text-faint"}`}
            >
              {SUB_SCORE_LABEL[id].slice(0, 3)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Reasons({ reasons }: { reasons: SuggestionReason[] }) {
  return (
    <ul className="space-y-1.5">
      {reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-[12px] leading-snug text-mute">
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: REASON_COLOR[r.kind] }}
          />
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Implied upside vs the mean analyst target, when a live price is in hand. */
function Upside({ price, target }: { price?: number; target: number }) {
  if (!price || price <= 0 || !target) return null;
  const up = target / price - 1;
  const tone = up >= 0 ? "text-pos" : "text-neg";
  return (
    <span className={`font-mono tnum ${tone}`}>
      {up >= 0 ? "+" : ""}
      {fmtPct(up, 0)} to target
    </span>
  );
}

function SectorChip({ sector }: { sector: Sector }) {
  const c = SECTOR_COLOR[sector];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
      style={{ background: `color-mix(in srgb, ${c} 12%, transparent)`, color: c }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {sectorLabel(sector)}
    </span>
  );
}

/* ------------------------------- cards ------------------------------- */

function FeaturedCard({ s, price }: { s: Suggestion; price?: number }) {
  const f = s.fundamentals;
  const accent = SECTOR_COLOR[s.sector];
  return (
    <Card className="px-6 py-6 sm:px-8" i={0.5} hover={false}>
      <div className="grid items-center gap-7 lg:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-center">
          <Ring score={Math.round(s.score)} size={150} color={tierColor(s.score)}>
            <div className="eyebrow">conviction</div>
            <div
              className="font-display text-[40px] font-bold leading-none"
              style={{ color: tierColor(s.score) }}
            >
              {Math.round(s.score)}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-faint">/ 100</div>
          </Ring>
          <span className="mt-3 rounded-full border border-edge bg-white/[0.02] px-3 py-1 text-[11px] font-medium text-mute">
            #1 · {LEAD_TAG[s.lead]}
          </span>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <TickerLogo symbol={s.symbol} accent={accent} size={40} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[16px] font-semibold text-ink">
                  {s.symbol}
                </span>
                <SectorChip sector={s.sector} />
              </div>
              <div className="truncate text-[12px] text-faint">{f.name}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_180px]">
            <div className="min-w-0">
              <Reasons reasons={s.reasons} />
            </div>
            <SubScoreBars scores={s.subScores} lead={s.lead} delay={0.2} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-edge pt-4 font-mono text-[11px] text-mute">
            <Stat label="Fwd P/E" value={fmtMultiple(f.forwardPE)} />
            <Stat label="Rev growth" value={fmtPct(f.revenueGrowth, 0)} />
            <Stat label="Analyst" value={s.rating} />
            <div className="flex items-baseline gap-1.5">
              <span className="text-faint">Upside</span>
              <Upside price={price} target={s.priceTarget} />
            </div>
            <Link
              href={`/research?symbol=${s.symbol}`}
              className="ml-auto text-sky transition-colors hover:text-ink"
            >
              Research →
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SuggestionCard({
  s,
  i,
  price,
}: {
  s: Suggestion;
  i: number;
  price?: number;
}) {
  const f = s.fundamentals;
  const accent = SECTOR_COLOR[s.sector];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col rounded-2xl border border-edge bg-white/[0.015] p-4 transition-transform duration-300 hover:-translate-y-0.5"
      style={{ borderTop: `2px solid ${tierColor(s.score)}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TickerLogo symbol={s.symbol} accent={accent} size={34} />
          <div className="min-w-0">
            <div className="font-mono text-[13.5px] font-semibold text-ink">
              {s.symbol}
            </div>
            <div className="truncate text-[10.5px] text-faint">{f.name}</div>
          </div>
        </div>
        <div className="text-right">
          <div
            className="font-display text-[24px] font-bold leading-none"
            style={{ color: tierColor(s.score) }}
          >
            {Math.round(s.score)}
          </div>
          <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wide text-faint">
            conviction
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <SectorChip sector={s.sector} />
        <span className="font-mono text-[10px] text-mute">{LEAD_TAG[s.lead]}</span>
      </div>

      <div className="mt-3.5">
        <SubScoreBars scores={s.subScores} lead={s.lead} delay={0.1 + i * 0.03} />
      </div>

      <div className="mt-3.5 flex-1">
        <Reasons reasons={s.reasons} />
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-edge pt-3 font-mono text-[10px] text-mute">
        <Stat label="P/E" value={fmtMultiple(f.forwardPE)} />
        <Stat label="Grw" value={fmtPct(f.revenueGrowth, 0)} />
        <Upside price={price} target={s.priceTarget} />
        <Link
          href={`/research?symbol=${s.symbol}`}
          className="ml-auto text-sky transition-colors hover:text-ink"
        >
          Research →
        </Link>
      </div>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-faint">{label}</span>
      <span className="text-ink">{value}</span>
    </span>
  );
}
