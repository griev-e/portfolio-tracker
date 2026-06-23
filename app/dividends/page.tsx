"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader } from "@/components/ui/Card";
import { Computing } from "@/components/ui/Computing";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Ring } from "@/components/ui/Ring";
import { Stat } from "@/components/ui/Stat";
import { dividendReport } from "@/lib/analytics/dividends/engine";
import type {
  DividendGrade,
  DividendProfile,
  HoldingDividend,
} from "@/lib/analytics/dividends/types";
import { fmtPct, fmtUSD, fmtUSDCompact } from "@/lib/format";
import { usePortfolio } from "@/lib/store";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const GRADE_TONE: Record<DividendGrade, string> = {
  Elite: "text-mint",
  Strong: "text-pos",
  Average: "text-sky",
  Weak: "text-warn",
  "High Risk": "text-neg",
};

const SAFETY_CHIP: Record<HoldingDividend["safetyTone"], string> = {
  safe: "border-pos/30 bg-pos/10 text-pos",
  watch: "border-warn/30 bg-warn/10 text-warn",
  risk: "border-neg/30 bg-neg/10 text-neg",
};

function useDividendProfiles(symbols: string[]) {
  const [profiles, setProfiles] = useState<Record<
    string,
    DividendProfile | null
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = symbols.join(",");

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dividends?symbols=${key}`);
      if (res.status === 401) {
        window.location.replace("/lock");
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as {
        profiles: Record<string, DividendProfile | null>;
      };
      setProfiles(json.profiles);
    } catch {
      setError("Dividend data provider unreachable.");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  return { profiles, error, loading, refresh: load };
}

function ScorePill({ label, score }: { label: string; score: number }) {
  const tone =
    score >= 65 ? "text-pos" : score >= 45 ? "text-warn" : "text-neg";
  const barColor =
    score >= 65
      ? "var(--color-pos)"
      : score >= 45
        ? "var(--color-warn)"
        : "var(--color-neg)";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] text-mute">{label}</span>
        <span className={`font-mono tnum text-[14px] font-medium ${tone}`}>
          {score}
        </span>
      </div>
      <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-white/[0.05]">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `color-mix(in srgb, ${barColor} 80%, transparent)`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

export default function DividendsPage() {
  const { ready, portfolio } = usePortfolio();

  const symbols = useMemo(
    () =>
      portfolio
        ? [...new Set(portfolio.positions.map((p) => p.symbol))].sort()
        : [],
    [portfolio]
  );
  const { profiles, error, loading, refresh } = useDividendProfiles(symbols);

  const report = useMemo(
    () => (portfolio && profiles ? dividendReport(portfolio, profiles) : null),
    [portfolio, profiles]
  );

  if (!ready) return null;
  if (!portfolio) return <EmptyState page="Dividend analysis" />;

  if (!report) {
    return (
      <div>
        <Header />
        <div className="relative">
          <Computing active={loading} label="pulling payment history…" />
          {!loading && error ? (
            <div className="panel flex h-[360px] flex-col items-center justify-center gap-4 px-8 text-center">
              <div className="text-[13.5px] text-mute">{error}</div>
              <button onClick={refresh} className="btn-secondary">
                Retry
              </button>
            </div>
          ) : (
            <div className="panel h-[360px]" />
          )}
        </div>
      </div>
    );
  }

  if (report.payerCount === 0) {
    return (
      <div>
        <Header />
        <Card className="mx-auto mt-12 max-w-md px-8 py-10 text-center" i={0}>
          <h2 className="font-display text-lg font-semibold text-ink">
            No dividend payers found
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-mute">
            None of the current holdings pay a dividend — this book is built
            for growth, not income.
          </p>
        </Card>
      </div>
    );
  }

  const r = report;
  const maxMonth = Math.max(...r.calendar.map((m) => m.income), 1);
  const maxSector = Math.max(...r.sectorIncome.map((s) => s.income), 1);

  return (
    <div>
      <Header />

      {/* Hero: composite + income */}
      <Card className="mb-5 px-6 py-6 sm:px-8" i={0} hover={false}>
        <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
          <div className="flex items-center gap-6">
            <Ring score={r.composite} size={150} stroke={8}>
              <div className="eyebrow">dividend score</div>
              <div
                className={`font-display text-[30px] font-bold leading-tight ${GRADE_TONE[r.grade]}`}
              >
                {r.composite}
              </div>
              <div className={`text-[12px] font-medium ${GRADE_TONE[r.grade]}`}>
                {r.grade}
              </div>
            </Ring>
            <div className="grid w-44 gap-3">
              <ScorePill label="Safety" score={r.safety} />
              <ScorePill label="Growth" score={r.growth} />
              <ScorePill label="Stability" score={r.stability} />
              <ScorePill label="Diversification" score={r.diversification} />
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <Stat
                label="Forward annual income"
                value={r.annualIncome}
                format={(v) => fmtUSD(v, true)}
                size="lg"
                sub={`${fmtUSD(r.monthlyAvg, true)}/mo average`}
              />
            </div>
            <Stat
              label="Portfolio yield"
              value={r.portfolioYield}
              format={(v) => fmtPct(v, 2)}
              sub={`${fmtPct(r.equityYield, 2)} on invested equity`}
            />
            <Stat
              label="Yield on cost"
              value={r.yieldOnCost}
              format={(v) => fmtPct(v, 2)}
              sub="forward rate ÷ what you paid"
            />
            <Stat
              label="Trailing 12m collected"
              value={r.ttmIncome}
              format={(v) => fmtUSD(v, true)}
              sub="at current share counts"
            />
            <Stat
              label="Income growth"
              value={r.portfolioCagr3 ?? r.portfolioGrowth1 ?? 0}
              format={(v) => fmtPct(v, 1, true)}
              toneClass={
                (r.portfolioCagr3 ?? 0) >= 0 ? "text-pos" : "text-neg"
              }
              sub={
                r.accelerating === null
                  ? "3y CAGR, income-weighted"
                  : r.accelerating
                    ? "3y CAGR · accelerating"
                    : "3y CAGR · decelerating"
              }
            />
            <Stat
              label="Payers"
              value={r.payerCount}
              format={(v) => `${v.toFixed(0)}/${r.positionCount}`}
              sub={
                r.estimatedCount > 0
                  ? `${r.estimatedCount} estimated from yield`
                  : "with payment history"
              }
            />
          </div>
        </div>
      </Card>

      {/* Calendar + forecast */}
      <div className="mb-5 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card className="px-6 py-5" i={1}>
          <CardHeader
            eyebrow="Payment calendar"
            title="Projected income by month"
            right={
              <span className="font-mono text-[10px] text-faint">
                next 12 months, by historical pay months
              </span>
            }
            className="mb-4"
          />
          <div className="flex h-[180px] items-end gap-2">
            {r.calendar.map((m, i) => (
              <div
                key={m.month}
                className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                title={`${MONTH_FULL[i]}: ${fmtUSD(m.income, true)}${m.payers.length ? ` — ${m.payers.join(", ")}` : ""}`}
              >
                <span className="font-mono tnum text-[9px] text-faint opacity-0 transition-opacity group-hover:opacity-100">
                  {fmtUSDCompact(m.income)}
                </span>
                <motion.div
                  className="w-full rounded-t-[3px]"
                  style={{
                    background:
                      m.income === 0
                        ? "rgba(255,255,255,0.04)"
                        : "color-mix(in srgb, var(--color-mint) 55%, transparent)",
                    minHeight: m.income === 0 ? 3 : undefined,
                  }}
                  initial={{ height: 0 }}
                  animate={{
                    height: `${Math.max((m.income / maxMonth) * 100, m.income > 0 ? 4 : 2)}%`,
                  }}
                  transition={{ duration: 0.6, delay: 0.15 + i * 0.04 }}
                />
                <span className="font-mono text-[10px] text-faint">
                  {MONTHS[i]}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-edge pt-3 text-[11.5px] leading-relaxed text-faint">
            {r.gapMonths.length === 0
              ? "Income lands in every month of the year."
              : `No income lands in ${r.gapMonths.map((m) => MONTH_FULL[m - 1]).join(", ")}.`}{" "}
            {r.evenness !== null &&
              (r.evenness < 0.35
                ? "The stream is evenly distributed — predictable cash flow."
                : r.evenness < 0.8
                  ? "The stream is somewhat lumpy across the year."
                  : "Income is highly concentrated in a few months.")}
          </p>
        </Card>

        <Card className="px-6 py-5" i={2}>
          <CardHeader
            eyebrow="Income forecast"
            title="Where this stream is heading"
            className="mb-4"
          />
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-edge text-left">
                <th className="py-2 text-[11px] font-medium text-faint">Scenario</th>
                <th className="py-2 text-right text-[11px] font-medium text-faint">Growth</th>
                <th className="py-2 text-right text-[11px] font-medium text-faint">1y</th>
                <th className="py-2 text-right text-[11px] font-medium text-faint">3y</th>
                <th className="py-2 text-right text-[11px] font-medium text-faint">5y</th>
              </tr>
            </thead>
            <tbody>
              {r.scenarios.map((s) => (
                <tr key={s.id} className="border-b border-edge/60">
                  <td className="py-2.5 text-mute">{s.label}</td>
                  <td
                    className={`py-2.5 text-right font-mono tnum ${s.growth >= 0 ? "text-pos" : "text-neg"}`}
                  >
                    {fmtPct(s.growth, 1, true)}
                  </td>
                  <td className="py-2.5 text-right font-mono tnum text-ink">
                    {fmtUSD(s.y1, true)}
                  </td>
                  <td className="py-2.5 text-right font-mono tnum text-ink">
                    {fmtUSD(s.y3, true)}
                  </td>
                  <td className="py-2.5 text-right font-mono tnum text-ink">
                    {fmtUSD(s.y5, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-[11.5px] leading-relaxed text-mute">
            Reinvesting every payment lifts base-case year-5 income to{" "}
            <span className="font-mono tnum text-ink">
              {fmtUSD(r.scenarios[1].y5Drip, true)}
            </span>{" "}
            — an extra{" "}
            <span className="font-mono tnum text-pos">
              +{fmtUSD(r.dripBoost5y, true)}
            </span>{" "}
            from compounding alone.
          </p>
          <div className="mt-4 flex items-center gap-4 border-t border-edge pt-3 font-mono text-[10px] text-faint">
            <span>
              your yield {fmtPct(r.portfolioYield, 2)}
            </span>
            {r.benchmarks.map((b) => (
              <span key={b.label}>
                {b.label} {fmtPct(b.yield, 2)}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Holdings table */}
      <Card className="mb-5 overflow-hidden" i={3}>
        <CardHeader
          eyebrow="Income engine room"
          title="Per-holding dividend evaluation"
          className="px-6 pt-5 mb-1"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[12.5px]">
            <thead>
              <tr className="border-b border-edge text-left">
                {[
                  "Asset",
                  "Income/yr",
                  "% of income",
                  "Yield",
                  "YoC",
                  "3y growth",
                  "Streak",
                  "Payout",
                  "Safety",
                ].map((h, hi) => (
                  <th
                    key={h}
                    className={`px-5 py-3 text-[11.5px] font-medium text-faint ${hi > 0 ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.holdings.map((h, i) => (
                <motion.tr
                  key={h.symbol}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 + i * 0.03 }}
                  className="border-b border-edge/60 hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-ink">
                        {h.symbol}
                      </span>
                      <span className="font-mono text-[9px] uppercase text-faint">
                        {h.frequency === "none" ? "—" : h.frequency}
                      </span>
                      {h.estimated && (
                        <span
                          className="rounded border border-warn/30 bg-warn/10 px-1 py-px font-mono text-[8.5px] text-warn"
                          title="Income estimated from snapshot yield — provider history unavailable"
                        >
                          est
                        </span>
                      )}
                      {h.flags.length > 0 && !h.estimated && (
                        <span
                          className="cursor-help font-mono text-[10px] text-warn"
                          title={h.flags.join("\n")}
                        >
                          ⚠{h.flags.length}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono tnum text-ink">
                    {fmtUSD(h.income, true)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-[4px] w-14 overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                          className="h-full rounded-full bg-mint/60"
                          style={{ width: `${Math.min(h.incomeShare * 200, 100)}%` }}
                        />
                      </div>
                      <span className="font-mono tnum text-mute">
                        {fmtPct(h.incomeShare, 1)}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono tnum text-mute">
                    {h.currentYield === null ? "—" : fmtPct(h.currentYield, 2)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tnum text-mute">
                    {h.yieldOnCost === null ? "—" : fmtPct(h.yieldOnCost, 2)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right font-mono tnum ${
                      h.cagr3 === null
                        ? "text-faint"
                        : h.cagr3 >= 0
                          ? "text-pos"
                          : "text-neg"
                    }`}
                  >
                    {h.cagr3 === null ? "—" : fmtPct(h.cagr3, 1, true)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tnum text-mute">
                    {h.streak > 0 ? `${h.streak}y` : "—"}
                    {h.cuts10y > 0 && (
                      <span className="ml-1 text-neg" title={`${h.cuts10y} cut(s) in the last decade`}>
                        ✂
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tnum text-mute">
                    {h.payoutRatio === null ? "—" : fmtPct(h.payoutRatio, 0)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span
                      className={`inline-block cursor-help rounded border px-1.5 py-0.5 font-mono text-[10px] ${SAFETY_CHIP[h.safetyTone]}`}
                      title={h.safetyNotes.join("\n")}
                    >
                      {h.safety}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-6 py-3 text-[10.5px] text-faint">
          Hover a safety score for the full point-by-point reasoning; hover ⚠
          for that holding's risk flags.
        </p>
      </Card>

      {/* Concentration + risks */}
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card className="px-6 py-5" i={4}>
          <CardHeader
            eyebrow="Concentration"
            title="Where the income comes from"
            right={
              <span className="font-mono text-[10px] text-faint">
                eff. payers {r.effectivePayers.toFixed(1)} · eff. sectors{" "}
                {r.effectiveSectors.toFixed(1)}
              </span>
            }
            className="mb-4"
          />
          <div className="space-y-2">
            {r.sectorIncome.slice(0, 8).map((s, i) => (
              <div key={s.sector} className="flex items-center gap-3">
                <span className="w-36 shrink-0 truncate text-[11.5px] text-mute">
                  {s.sector}
                </span>
                <div className="relative h-[14px] flex-1 overflow-hidden rounded-[3px] bg-white/[0.04]">
                  <motion.div
                    className="h-full rounded-[3px]"
                    style={{
                      background:
                        "color-mix(in srgb, var(--color-sky) 45%, transparent)",
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(s.income / maxSector) * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.1 + i * 0.05 }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right font-mono tnum text-[11.5px] text-mute">
                  {fmtPct(s.share, 1)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-edge pt-3 text-[11.5px] leading-relaxed text-faint">
            Top payer carries {fmtPct(r.topPayerShare, 1)} of the stream; the
            top three carry {fmtPct(r.top3Share, 1)}.{" "}
            {r.topPayerShare > 0.4
              ? "That is heavy single-name dependence for an income stream."
              : r.top3Share > 0.75
                ? "A small core funds most of the income — watch those names closely."
                : "No single name can break the income stream on its own."}{" "}
            Fund income is allocated to sectors by each fund's holdings mix.
          </p>
        </Card>

        <Card className="px-6 py-5" i={5}>
          <CardHeader
            eyebrow="Risk register"
            title="Where income could crack"
            className="mb-4"
          />
          {r.riskFlags.length === 0 ? (
            <p className="text-[12.5px] text-mute">
              No payout, coverage, or history flags across the book — a clean
              income stream.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {r.riskFlags.slice(0, 10).map((f, i) => (
                <motion.li
                  key={`${f.symbol}-${f.flag}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.04 }}
                  className="flex items-start gap-2.5 text-[12px] leading-snug"
                >
                  <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-warn/70" />
                  <span className="text-mute">
                    <span className="font-mono font-medium text-ink">
                      {f.symbol}
                    </span>{" "}
                    — {f.flag}
                  </span>
                </motion.li>
              ))}
              {r.riskFlags.length > 10 && (
                <li className="text-[11px] text-faint">
                  +{r.riskFlags.length - 10} more flags in the holdings table
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      {/* Methodology */}
      <Methodology steps={r.methodology} />
    </div>
  );
}

/** Collapsible explainability panel, collapsed by default to stay out of the way. */
function Methodology({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="px-6 py-5" i={6} hover={false}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div>
          <div className="eyebrow mb-0.5">Explainability</div>
          <h2 className="font-display text-[14px] font-medium text-ink">
            How this is computed
          </h2>
        </div>
        <span className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-faint">
          {open ? "Hide" : "Show"}
          <svg
            viewBox="0 0 10 6"
            aria-hidden
            className={`h-[6px] w-[10px] transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          >
            <path
              d="M1 1l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open && (
        <ol className="mt-4 grid gap-x-8 gap-y-2 md:grid-cols-2">
          {steps.map((m, i) => (
            <li
              key={m}
              className="flex gap-2.5 text-[11.5px] leading-relaxed text-mute"
            >
              <span className="font-mono text-[10px] text-faint">
                {`0${i + 1}`.slice(-2)}
              </span>
              {m}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function Header() {
  return (
    <PageHeader
      eyebrow="Portfolio"
      title="Dividends"
      description="Income generation, quality, and durability — how much the book pays, how safely, how fast it grows, and where it could crack."
    />
  );
}
