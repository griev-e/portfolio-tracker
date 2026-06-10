"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Ring } from "@/components/ui/Ring";
import { qualityReport } from "@/lib/analytics/quality";
import { fmtMultiple, fmtPct } from "@/lib/format";
import { usePortfolio } from "@/lib/store";

function fmtMetric(value: number, format: "pct" | "multiple" | "ratio"): string {
  if (!Number.isFinite(value)) return "n/m";
  if (format === "pct") return fmtPct(value, 1);
  if (format === "multiple") return fmtMultiple(value);
  return value.toFixed(2);
}

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
          : "Fundamentals screen below the index. Check what you're paying for.";

  return (
    <div>
      <PageHeader
        eyebrow="Analysis"
        title="Quality Scorecard"
        description="Every metric is the position-weighted aggregate of your holdings, graded against the S&P 500. Multiples use weighted harmonic means."
      />

      <div className="mb-5 grid gap-5 lg:grid-cols-[330px_1fr]">
        {/* Composite */}
        <Card className="flex flex-col items-center justify-center px-6 py-8" i={0}>
          <Ring score={report.composite} size={190}>
            <div className="eyebrow">composite</div>
            <div
              className={`font-display text-[46px] font-bold leading-none ${
                GRADE_COLOR[report.compositeGrade]
              }`}
            >
              {report.compositeGrade}
            </div>
            <div className="mt-1 font-mono tnum text-[13px] text-mute">
              {report.composite}/100
            </div>
          </Ring>
          <p className="mt-6 text-center text-[12.5px] leading-relaxed text-mute">
            {verdict}
          </p>
          {report.coveragePct < 0.95 && (
            <div className="mt-3 font-mono text-[10px] text-warn/80">
              based on {fmtPct(report.coveragePct, 0)} of invested capital
            </div>
          )}
        </Card>

        {/* Metric grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {report.metrics.map((m, i) => {
            const ratio = m.lowerIsBetter
              ? m.benchmark / (Number.isFinite(m.value) ? m.value : m.benchmark * 3)
              : m.value / m.benchmark;
            return (
              <Card key={m.key} className="px-5 py-4" i={i * 0.5 + 1} hover>
                <div className="flex items-start justify-between">
                  <div className="text-[12px] text-mute">{m.label}</div>
                  <motion.div
                    initial={{ scale: 0, rotate: -12 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.3 + i * 0.05, type: "spring", stiffness: 320, damping: 16 }}
                    className={`font-display text-[17px] font-bold ${GRADE_COLOR[m.grade]}`}
                  >
                    {m.grade}
                  </motion.div>
                </div>
                <div className="mt-1 font-mono tnum text-[21px] text-ink">
                  {fmtMetric(m.value, m.format)}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background:
                          m.score >= 57
                            ? "linear-gradient(90deg, rgba(94,234,212,0.35), var(--color-mint))"
                            : m.score >= 43
                              ? "linear-gradient(90deg, rgba(251,191,36,0.35), var(--color-warn))"
                              : "linear-gradient(90deg, rgba(251,113,133,0.35), var(--color-neg))",
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${m.score}%` }}
                      transition={{ duration: 0.8, delay: 0.25 + i * 0.04 }}
                    />
                    <div className="absolute top-0 left-1/2 h-full w-[1.5px] bg-white/20" />
                  </div>
                </div>
                <div className="mt-1.5 flex justify-between font-mono text-[10px] text-faint">
                  <span>
                    SPX {fmtMetric(m.benchmark, m.format)}
                  </span>
                  <span>
                    {ratio >= 1 ? "+" : ""}
                    {((ratio - 1) * 100).toFixed(0)}% vs index
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Per-holding contribution table */}
      <Card className="overflow-hidden" i={4}>
        <CardHeader
          eyebrow="Drill-down"
          title="Per-holding fundamentals"
          className="px-6 pt-5 mb-2"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="border-b border-edge text-left">
                {["Asset", "Weight", "Rev growth", "EPS growth", "FCF growth", "ROIC", "Op margin", "Fwd P/E"].map(
                  (h, hi) => (
                    <th
                      key={h}
                      className={`px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-faint ${
                        hi > 0 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {portfolio.positions
                .filter((p) => p.fundamentals)
                .map((p, i) => {
                  const f = p.fundamentals!;
                  return (
                    <motion.tr
                      key={p.symbol}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 + i * 0.03 }}
                      className="border-b border-edge/60 hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-3 font-mono font-medium text-ink">
                        {p.symbol}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tnum text-mute">
                        {fmtPct(p.equityWeight, 1)}
                      </td>
                      <Num v={f.revenueGrowth} />
                      <Num v={f.epsGrowth} />
                      <Num v={f.fcfGrowth} />
                      <Num v={f.roic} flatBelow={0.1} />
                      <Num v={f.operatingMargin} flatBelow={0.08} />
                      <td className="px-5 py-3 text-right font-mono tnum text-ink">
                        {fmtMultiple(f.forwardPE)}
                      </td>
                    </motion.tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Num({ v, flatBelow = 0 }: { v: number; flatBelow?: number }) {
  const cls =
    v < 0 ? "text-neg" : v < flatBelow ? "text-mute" : v > 0.15 ? "text-mint" : "text-ink";
  return (
    <td className={`px-5 py-3 text-right font-mono tnum ${cls}`}>
      {fmtPct(v, 1, true)}
    </td>
  );
}
