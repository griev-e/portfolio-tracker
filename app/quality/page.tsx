"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Meter } from "@/components/ui/Meter";
import { PageHeader } from "@/components/ui/PageHeader";
import { Ring } from "@/components/ui/Ring";
import {
  CATEGORY_ORDER,
  qualityReport,
  type HoldingQuality,
  type MetricContribution,
  type QualityCategory,
  type QualityCategoryId,
  type QualityMetric,
} from "@/lib/analytics/quality";
import { fmtMultiple, fmtPct } from "@/lib/format";
import { usePortfolio } from "@/lib/store";

const GRADE_COLOR: Record<string, string> = {
  "A+": "text-mint",
  A: "text-mint",
  "A-": "text-pos",
  "B+": "text-pos",
  B: "text-sky",
  "B-": "text-sky",
  "C+": "text-warn",
  C: "text-warn",
  "C-": "text-warn",
  D: "text-neg",
  F: "text-neg",
};

const CATEGORY_LABEL: Record<QualityCategoryId, string> = {
  growth: "Growth",
  profitability: "Profitability",
  valuation: "Valuation",
  income: "Income & Yield",
};

const CATEGORY_LETTER: Record<QualityCategoryId, string> = {
  growth: "G",
  profitability: "P",
  valuation: "V",
  income: "I",
};

/** Score → bar/accent color (aligned with the grade bands). */
const tierColor = (s: number): string =>
  s >= 57 ? "var(--color-mint)" : s >= 43 ? "var(--color-warn)" : "var(--color-neg)";

function fmtMetric(value: number, format: "pct" | "multiple" | "ratio"): string {
  if (!Number.isFinite(value)) return "n/m";
  if (format === "pct") return fmtPct(value, 1);
  if (format === "multiple") return fmtMultiple(value);
  return value.toFixed(2);
}

export default function QualityPage() {
  const { ready, portfolio } = usePortfolio();
  const report = useMemo(
    () => (portfolio ? qualityReport(portfolio) : null),
    [portfolio]
  );

  if (!ready) return null;
  if (!portfolio || !report) return <EmptyState page="The quality scorecard" />;

  const verdict =
    report.composite >= 75
      ? "You own a high-quality compounder book that out-earns the index."
      : report.composite >= 55
        ? "Solidly above-index fundamentals with a few soft spots below."
        : report.composite >= 40
          ? "Roughly index-grade fundamentals — the tilts mostly cancel out."
          : "Fundamentals screen below the index. Check what you are paying for.";

  const lift = report.contributions[0];
  const drag = report.contributions[report.contributions.length - 1];

  return (
    <div>
      <PageHeader
        eyebrow="Analysis"
        title="Quality Scorecard"
        description="Every metric is the position-weighted aggregate of your holdings, graded against the S&P 500. Multiples use weighted harmonic means."
      />

      {/* Hero: composite grade + drivers */}
      <Card className="mb-5 px-6 py-6 sm:px-8" i={0} hover={false}>
        <div className="grid items-center gap-8 lg:grid-cols-[280px_1fr]">
          <div className="flex flex-col items-center">
            <Ring score={report.composite} size={196}>
              <div className="eyebrow">composite</div>
              <motion.div
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.35, type: "spring", stiffness: 280, damping: 15 }}
                className={`font-display text-[48px] font-bold leading-none ${GRADE_COLOR[report.compositeGrade]}`}
              >
                {report.compositeGrade}
              </motion.div>
              <div className="mt-1 font-mono tnum text-[13px] text-mute">
                <AnimatedNumber
                  value={report.composite}
                  from={0}
                  format={(v) => `${Math.round(v)}/100`}
                />
              </div>
            </Ring>
            {report.coveragePct < 0.95 && (
              <div className="mt-3 font-mono text-[10px] text-warn/80">
                based on {fmtPct(report.coveragePct, 0)} of invested capital
              </div>
            )}
          </div>

          <div>
            <p className="max-w-xl text-[13px] leading-relaxed text-mute">{verdict}</p>

            <div className="mt-5 flex items-baseline justify-between">
              <div className="eyebrow">Category breakdown</div>
              <span className="font-mono text-[9.5px] uppercase tracking-wide text-faint">
                tick = S&P 500
              </span>
            </div>
            <div className="mt-2.5 space-y-2.5">
              {report.categories.map((c, i) => (
                <CategoryBreakdownRow key={c.id} cat={c} i={i} />
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <DriverCallout kind="lift" c={lift} />
              <DriverCallout kind="drag" c={drag} />
            </div>
          </div>
        </div>
      </Card>

      {/* Category sections */}
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        {CATEGORY_ORDER.map((id, i) => {
          const cat = report.categories.find((c) => c.id === id)!;
          return <CategoryPanel key={id} cat={cat} i={i} />;
        })}
      </div>

      {/* Per-holding quality */}
      <Card className="px-6 py-5" i={4} hover={false}>
        <CardHeader
          eyebrow="Drill-down"
          title="Holdings by quality"
          right={
            <span className="hidden font-mono text-[10px] text-faint sm:inline">
              same scorecard, graded per name vs the S&P 500
            </span>
          }
          className="mb-5"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {report.holdings.map((h, i) => (
            <HoldingCard key={h.symbol} h={h} i={i} bookScore={report.composite} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function CategoryBreakdownRow({ cat, i }: { cat: QualityCategory; i: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-[12px] text-mute">{cat.label}</span>
      <span className={`w-7 shrink-0 font-display text-[15px] font-bold ${GRADE_COLOR[cat.grade]}`}>
        {cat.grade}
      </span>
      <div className="flex-1">
        <Meter
          value={cat.score}
          max={100}
          benchmark={50}
          color={tierColor(cat.score)}
          height={6}
          delay={0.25 + i * 0.06}
        />
      </div>
      <span className="w-8 shrink-0 text-right font-mono tnum text-[12px] text-ink">
        {cat.score}
      </span>
      <span
        className="w-9 shrink-0 text-right font-mono text-[9.5px] text-faint"
        title="Share of the composite this category carries"
      >
        {fmtPct(cat.weight, 0)}
      </span>
    </div>
  );
}

function DriverCallout({ kind, c }: { kind: "lift" | "drag"; c: MetricContribution }) {
  const isLift = kind === "lift";
  // A "drag" that is actually positive (rare: every metric beats the index)
  // is relabeled so the copy stays honest.
  const positive = c.contribution >= 0;
  const title = isLift ? "Biggest lift" : positive ? "Weakest spot" : "Biggest drag";
  const accent = isLift ? "var(--color-pos)" : positive ? "var(--color-sky)" : "var(--color-neg)";
  return (
    <div className="rounded-xl border border-edge bg-white/[0.015] px-4 py-3">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        <span className="eyebrow">{title}</span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">{c.label}</span>
        <span className={`font-display text-[15px] font-bold ${GRADE_COLOR[c.grade]}`}>
          {c.grade}
        </span>
      </div>
      <div className="mt-0.5 font-mono text-[10.5px] text-faint">
        {fmtMetric(c.value, c.format)} · S&P {fmtMetric(c.benchmark, c.format)}
      </div>
    </div>
  );
}

function CategoryPanel({ cat, i }: { cat: QualityCategory; i: number }) {
  return (
    <Card className="px-5 py-5" i={i * 0.4 + 1}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[13px] font-medium text-ink">{cat.label}</div>
          <div className="mt-0.5 font-mono text-[10px] text-faint">
            {fmtPct(cat.weight, 0)} of composite
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono tnum text-[13px] text-mute">{cat.score}</span>
          <span className={`font-display text-[22px] font-bold leading-none ${GRADE_COLOR[cat.grade]}`}>
            {cat.grade}
          </span>
        </div>
      </div>
      <div className="space-y-3.5">
        {cat.metrics.map((m, mi) => (
          <MetricRow key={m.key} m={m} delay={0.2 + i * 0.05 + mi * 0.05} />
        ))}
      </div>
    </Card>
  );
}

function MetricRow({ m, delay }: { m: QualityMetric; delay: number }) {
  return (
    <div title={m.description}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-mute">{m.label}</span>
        <span className="flex items-baseline gap-2">
          <span className="font-mono tnum text-[13px] text-ink">
            {fmtMetric(m.value, m.format)}
          </span>
          <span className="font-mono text-[10px] text-faint">
            S&P {fmtMetric(m.benchmark, m.format)}
          </span>
          <span className={`w-5 text-right font-display text-[12px] font-bold ${GRADE_COLOR[m.grade]}`}>
            {m.grade}
          </span>
        </span>
      </div>
      <Meter
        value={m.score}
        max={100}
        benchmark={50}
        color={tierColor(m.score)}
        height={5}
        delay={delay}
      />
    </div>
  );
}

function HoldingCard({
  h,
  i,
  bookScore,
}: {
  h: HoldingQuality;
  i: number;
  bookScore: number;
}) {
  // Strongest / softest category, derived from the per-category sub-scores.
  const cats = CATEGORY_ORDER.map((id) => ({ id, score: h.categories[id] }));
  const strongest = cats.reduce((a, b) => (b.score > a.score ? b : a));
  const softest = cats.reduce((a, b) => (b.score < a.score ? b : a));
  const spread = strongest.score - softest.score;

  // How this name grades against the whole book.
  const vsBook = Math.round(h.score - bookScore);
  const vsTone =
    vsBook > 0 ? "text-pos" : vsBook < 0 ? "text-neg" : "text-faint";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-edge bg-white/[0.015] px-4 py-3.5 transition-transform duration-300 hover:-translate-y-0.5"
      style={{ borderLeft: `2px solid ${tierColor(h.score)}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-medium text-ink">{h.symbol}</div>
          <div className="truncate text-[10.5px] text-faint">{h.name}</div>
        </div>
        <div className="text-right">
          <div className={`font-display text-[22px] font-bold leading-none ${GRADE_COLOR[h.grade]}`}>
            {h.grade}
          </div>
          <div className="mt-1 font-mono tnum text-[10px] text-mute">{h.score}</div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between font-mono text-[10px]">
        <span className="text-faint">{fmtPct(h.weight, 1)} of book</span>
        <span className={vsTone}>
          {vsBook > 0 ? "+" : ""}
          {vsBook} vs book
        </span>
      </div>

      <div className="mt-3 flex items-end gap-2">
        {cats.map(({ id, score: s }, ci) => (
          <div key={id} className="flex flex-1 flex-col items-center gap-1">
            <span className="font-mono tnum text-[8.5px] text-mute">{s}</span>
            <div className="flex h-9 w-full items-end overflow-hidden rounded bg-white/[0.04]">
              <motion.div
                className="w-full rounded"
                style={{ background: tierColor(s), opacity: 0.85 }}
                initial={{ height: 0 }}
                animate={{ height: `${s}%` }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.04 + ci * 0.04 }}
              />
            </div>
            <span className="font-mono text-[8.5px] text-faint">{CATEGORY_LETTER[id]}</span>
          </div>
        ))}
      </div>

      {/* Strongest / softest read so the card says something, not just shows bars. */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-edge pt-2.5 font-mono text-[9.5px]">
        <span className="flex items-center gap-1 text-mute">
          <span className="text-pos">▲</span>
          {CATEGORY_LABEL[strongest.id]}
        </span>
        {spread > 4 ? (
          <span className="flex items-center gap-1 text-mute">
            <span className="text-neg">▼</span>
            {CATEGORY_LABEL[softest.id]}
          </span>
        ) : (
          <span className="text-faint">evenly balanced</span>
        )}
      </div>
    </motion.div>
  );
}
