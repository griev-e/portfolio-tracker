"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PALETTE } from "@/components/charts/Donut";
import { Card, CardHeader } from "@/components/ui/Card";
import { Computing } from "@/components/ui/Computing";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TickerLogo } from "@/components/ui/TickerLogo";
import { fmtNum, fmtPct, fmtShares, fmtUSD, relativeTime } from "@/lib/format";
import { optimizePortfolio } from "@/lib/optimizer/optimize";
import type {
  Confidence,
  ObjectiveId,
  OptimizerPlan,
  OptimizerRequest,
  OptimizerResponse,
  OptimizerResult,
  PortfolioMetrics,
  ShiftAction,
} from "@/lib/optimizer/types";
import { usePortfolio } from "@/lib/store";
import type { Portfolio } from "@/lib/types";
import { useAsyncCompute } from "@/lib/useAsyncCompute";
import { useElementSize } from "@/lib/useElementWidth";

/* ──────────────────────────────── presets ───────────────────────────────── */

interface Preset {
  id: ObjectiveId;
  label: string;
  tag: string;
  blurb: string;
  accent: string;
}

const PRESETS: Preset[] = [
  {
    id: "sharpe",
    label: "Maximum Sharpe",
    tag: "Risk-adjusted return",
    blurb: "The highest return per unit of risk — the tangency portfolio.",
    accent: "#5eead4",
  },
  {
    id: "min-vol",
    label: "Minimum Volatility",
    tag: "Lowest risk",
    blurb: "The least-volatile mix the holdings can form.",
    accent: "#60a5fa",
  },
  {
    id: "risk-parity",
    label: "Risk Parity",
    tag: "Equal risk budget",
    blurb: "Every holding contributes the same share of portfolio risk.",
    accent: "#a78bfa",
  },
  {
    id: "max-div",
    label: "Max Diversification",
    tag: "Spread the bets",
    blurb: "Maximize the diversification ratio across the book.",
    accent: "#34d399",
  },
  {
    id: "max-return",
    label: "Maximum Return",
    tag: "Highest expected return",
    blurb: "Tilt to the highest-return names within the position cap.",
    accent: "#fbbf24",
  },
  {
    id: "income",
    label: "Income",
    tag: "Maximize yield",
    blurb: "Lean into dividend yield, risk-penalized so it stays sane.",
    accent: "#f472b6",
  },
  {
    id: "quality",
    label: "Quality Tilt",
    tag: "Best businesses",
    blurb: "Weight toward high ROIC, margins, and growth.",
    accent: "#2dd4bf",
  },
  {
    id: "equal",
    label: "Equal Weight",
    tag: "Naïve 1/N",
    blurb: "An equal slice for every holding — the honest baseline.",
    accent: "#94a3b8",
  },
];

const CONVICTION: Record<Confidence, { label: string; cls: string }> = {
  high: { label: "High confidence", cls: "bg-pos/15 text-pos" },
  medium: { label: "Medium confidence", cls: "bg-sky/15 text-sky" },
  low: { label: "Low confidence", cls: "bg-white/[0.06] text-mute" },
};

const SHIFT_META: Record<ShiftAction, { label: string; cls: string }> = {
  increase: { label: "Increase", cls: "bg-pos/15 text-pos" },
  initiate: { label: "Initiate", cls: "bg-mint/15 text-mint" },
  decrease: { label: "Decrease", cls: "bg-warn/15 text-warn" },
  exit: { label: "Exit", cls: "bg-neg/15 text-neg" },
};

/* ────────────────────────────────── page ────────────────────────────────── */

export default function OptimizerPage() {
  const { ready, portfolio } = usePortfolio();

  const [objective, setObjective] = useState<ObjectiveId>("sharpe");
  const [maxWeight, setMaxWeight] = useState(0.1);
  const [allowExit, setAllowExit] = useState(false);
  // Floor that keeps held names from being fully exited when exits are off.
  const [minWeight, setMinWeight] = useState(0.01);

  const constraints = useMemo(
    () => ({ maxWeight, minWeight, allowExit }),
    [maxWeight, minWeight, allowExit]
  );

  const { value: result, pending } = useAsyncCompute(
    () => (portfolio ? optimizePortfolio(portfolio, objective, constraints) : null),
    [portfolio, objective, constraints]
  );

  if (!ready) return null;
  if (!portfolio) return <EmptyState page="The optimizer" />;

  const preset = PRESETS.find((p) => p.id === objective)!;

  return (
    <div>
      <PageHeader
        eyebrow="Analysis"
        title="Optimizer"
        description="Institutional portfolio construction on your holdings: pick an objective, set the guardrails, and solve for the optimal weights against the same factor risk model the rest of the terminal uses. Claude Sonnet 4.6 reads the result and writes the desk note. A model, not advice."
      />

      {/* ───────────── Objective presets ───────────── */}
      <Card className="mb-5 px-5 py-5 sm:px-6" hover={false} i={0}>
        <CardHeader eyebrow="Optimize for" title="Objective" className="mb-4" />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {PRESETS.map((p) => (
            <PresetCard
              key={p.id}
              preset={p}
              active={objective === p.id}
              onSelect={() => setObjective(p.id)}
            />
          ))}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        {/* ───────────── Controls + summary ───────────── */}
        <div className="space-y-5">
          <ConstraintsCard
            maxWeight={maxWeight}
            minWeight={minWeight}
            allowExit={allowExit}
            setMaxWeight={setMaxWeight}
            setMinWeight={setMinWeight}
            setAllowExit={setAllowExit}
            positionCount={portfolio.positions.length}
          />
          <SummaryCard result={result} accent={preset.accent} />
        </div>

        {/* ───────────── Frontier ───────────── */}
        <div className="relative flex min-w-0 flex-col">
          <Computing active={pending || !result} label="optimizing…" />
          {!result ? (
            <div className="panel min-h-[420px] flex-1" />
          ) : (
            <FrontierCard result={result} accent={preset.accent} />
          )}
        </div>
      </div>

      {/* ───────────── AI review (Sonnet 4.6) ───────────── */}
      {result && (
        <ReviewCard
          portfolio={portfolio}
          result={result}
          objectiveLabel={preset.label}
          accent={preset.accent}
        />
      )}

      {/* ───────────── Allocation + trades ───────────── */}
      {result && (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <AllocationCard result={result} />
          <TradeTicket result={result} />
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────── preset card ───────────────────────────── */

function PresetCard({
  preset,
  active,
  onSelect,
}: {
  preset: Preset;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`relative overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-colors ${
        active
          ? "border-transparent"
          : "border-edge bg-void/40 hover:border-edge2"
      }`}
      style={
        active
          ? { background: `color-mix(in srgb, ${preset.accent} 9%, #0a0a0a)` }
          : undefined
      }
    >
      {active && (
        <motion.span
          layoutId="preset-ring"
          className="pointer-events-none absolute inset-0 rounded-xl border"
          style={{ borderColor: `color-mix(in srgb, ${preset.accent} 55%, transparent)` }}
          transition={{ type: "spring", stiffness: 480, damping: 38 }}
        />
      )}
      <div className="relative z-10 flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full transition-transform"
          style={{
            background: preset.accent,
            boxShadow: active ? `0 0 10px ${preset.accent}` : "none",
          }}
        />
        <span className="font-display text-[13px] font-medium text-ink">
          {preset.label}
        </span>
      </div>
      <div
        className="relative z-10 mt-0.5 pl-4 font-mono text-[10px] uppercase tracking-[0.08em]"
        style={{ color: active ? preset.accent : "var(--color-faint)" }}
      >
        {preset.tag}
      </div>
      <p className="relative z-10 mt-1.5 pl-4 text-[11.5px] leading-snug text-mute">
        {preset.blurb}
      </p>
    </button>
  );
}

/* ─────────────────────────────── constraints ────────────────────────────── */

function ConstraintsCard({
  maxWeight,
  minWeight,
  allowExit,
  setMaxWeight,
  setMinWeight,
  setAllowExit,
  positionCount,
}: {
  maxWeight: number;
  minWeight: number;
  allowExit: boolean;
  setMaxWeight: (v: number) => void;
  setMinWeight: (v: number) => void;
  setAllowExit: (v: boolean) => void;
  positionCount: number;
}) {
  const minCap = positionCount > 0 ? 1 / positionCount : 0;
  return (
    <Card className="px-5 py-5" i={1}>
      <CardHeader eyebrow="Guardrails" title="Constraints" className="mb-4" />

      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[12.5px] text-mute">Max position</span>
            <span className="font-mono tnum text-[13px] text-ink">
              {fmtPct(maxWeight, 0)}
            </span>
          </div>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={maxWeight}
            onChange={(e) => setMaxWeight(Number(e.target.value))}
            className="w-full"
          />
          <p className="mt-1.5 text-[11px] leading-snug text-faint">
            No single holding exceeds this weight of the invested book. Floor is{" "}
            {fmtPct(minCap, 0)} ({positionCount} holdings).
          </p>
        </div>

        <div className="border-t border-edge pt-5">
          <button
            onClick={() => setAllowExit(!allowExit)}
            role="switch"
            aria-checked={allowExit}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="text-[12.5px] text-mute">Allow full exit</span>
            <span
              className={`relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors ${
                allowExit ? "bg-mint/70" : "bg-white/[0.12]"
              }`}
            >
              <span
                className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-ink transition-transform ${
                  allowExit ? "translate-x-[16px]" : "translate-x-[2px]"
                }`}
              />
            </span>
          </button>
          <p className="mt-1.5 text-[11px] leading-snug text-faint">
            {allowExit
              ? "The optimizer may sell a holding all the way to zero when the objective calls for it."
              : "Held names are kept above the floor below — the optimizer trims them rather than exiting outright."}
          </p>

          {/* Kept mounted but greyed out when full exit is on, so the panel
              doesn't jump as you toggle. */}
          <div
            className={`mt-4 transition-opacity ${
              allowExit ? "pointer-events-none opacity-40" : "opacity-100"
            }`}
            aria-disabled={allowExit}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[12.5px] text-mute">Minimum position</span>
              <span className="font-mono tnum text-[13px] text-ink">
                {fmtPct(minWeight, 1)}
              </span>
            </div>
            <input
              type="range"
              min={0.005}
              max={0.05}
              step={0.005}
              value={minWeight}
              disabled={allowExit}
              onChange={(e) => setMinWeight(Number(e.target.value))}
              className="w-full"
            />
            <p className="mt-1.5 text-[11px] leading-snug text-faint">
              Smallest weight a holding you already own can be trimmed to before
              it would count as a full exit.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────────── summary card ───────────────────────────── */

interface MetricSpec {
  label: string;
  before: number;
  after: number;
  fmt: (v: number) => string;
  higherBetter: boolean;
}

function SummaryCard({
  result,
  accent,
}: {
  result: OptimizerResult | null;
  accent: string;
}) {
  if (!result) {
    return (
      <Card className="h-[300px] px-5 py-5" i={2} hover={false}>
        <span className="sr-only">Computing optimization</span>
      </Card>
    );
  }
  const b = result.metricsBefore;
  const a = result.metricsAfter;
  const metrics: MetricSpec[] = [
    { label: "Expected return", before: b.expectedReturn, after: a.expectedReturn, fmt: (v) => fmtPct(v, 1), higherBetter: true },
    { label: "Volatility", before: b.volatility, after: a.volatility, fmt: (v) => fmtPct(v, 1), higherBetter: false },
    { label: "Sharpe ratio", before: b.sharpe, after: a.sharpe, fmt: (v) => fmtNum(v, 2), higherBetter: true },
    { label: "Diversification", before: b.diversification, after: a.diversification, fmt: (v) => `${fmtNum(v, 2)}×`, higherBetter: true },
    { label: "Effective holdings", before: b.effectiveN, after: a.effectiveN, fmt: (v) => fmtNum(v, 1), higherBetter: true },
    { label: "Portfolio yield", before: b.yield, after: a.yield, fmt: (v) => fmtPct(v, 2), higherBetter: true },
  ];

  return (
    <Card className="px-5 py-5" i={2} hover={false}>
      <CardHeader
        eyebrow="Current → optimized"
        title="Risk & return"
        className="mb-4"
      />
      <div className="space-y-3.5">
        {metrics.map((m) => (
          <MetricRow key={m.label} spec={m} accent={accent} />
        ))}
      </div>
      <p className="mt-4 border-t border-edge pt-3 text-[11px] leading-relaxed text-faint">
        Cash held at {fmtPct(result.cashWeight, 0)}. Turnover to implement{" "}
        {fmtPct(result.turnover, 1)} of the book.
      </p>
    </Card>
  );
}

function MetricRow({ spec, accent }: { spec: MetricSpec; accent: string }) {
  const delta = spec.after - spec.before;
  const improved = spec.higherBetter ? delta > 1e-6 : delta < -1e-6;
  const worse = spec.higherBetter ? delta < -1e-6 : delta > 1e-6;
  const toneCls = improved ? "text-pos" : worse ? "text-neg" : "text-mute";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px] text-mute">{spec.label}</span>
      <span className="flex items-center gap-2 font-mono tnum text-[12.5px]">
        <span className="text-faint">{spec.fmt(spec.before)}</span>
        <span className="text-faint">→</span>
        <span style={{ color: accent }}>{spec.fmt(spec.after)}</span>
        <span className={`w-[44px] text-right text-[11px] ${toneCls}`}>
          {improved ? "▲" : worse ? "▼" : "·"}
        </span>
      </span>
    </div>
  );
}

/* ─────────────────────────────── frontier card ──────────────────────────── */

function FrontierCard({
  result,
  accent,
}: {
  result: OptimizerResult;
  accent: string;
}) {
  return (
    <Card className="flex flex-1 flex-col px-6 py-5" hover={false}>
      <CardHeader
        eyebrow="Efficient frontier"
        title="Risk vs. expected return"
        right={
          <div className="flex items-center gap-3 font-mono text-[10px] text-faint">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full border border-white/50" />{" "}
              current
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: accent }}
              />{" "}
              optimized
            </span>
          </div>
        }
        className="mb-2"
      />
      <div className="min-h-[300px] flex-1">
        <FrontierChart result={result} accent={accent} />
      </div>
      <p className="mt-3 border-t border-edge pt-3 text-[11px] leading-relaxed text-faint">
        The curve is the best expected return achievable at each volatility,
        swept across the holdings under your constraints. Expected returns are
        CAPM (β · equity-risk-premium); co-movement is the terminal&apos;s factor
        covariance model.
      </p>
    </Card>
  );
}

function FrontierChart({
  result,
  accent,
}: {
  result: OptimizerResult;
  accent: string;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  // Fill the column the card stretches to; clamp so it never gets cramped.
  const H = Math.max(300, size.height || 320);
  const PAD = { l: 52, r: 22, t: 18, b: 40 };

  const pts = result.frontier;
  const xs = [...pts.map((p) => p.vol), result.current.vol, result.target.vol];
  const ys = [...pts.map((p) => p.ret), result.current.ret, result.target.ret];
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xPad = (xMax - xMin) * 0.12 || 0.01;
  const yPad = (yMax - yMin) * 0.16 || 0.01;

  const W = size.width;
  const x = (v: number) =>
    PAD.l + ((v - (xMin - xPad)) / (xMax - xMin + 2 * xPad)) * (W - PAD.l - PAD.r);
  const y = (v: number) =>
    H - PAD.b - ((v - (yMin - yPad)) / (yMax - yMin + 2 * yPad)) * (H - PAD.t - PAD.b);

  const linePath =
    pts.length > 1
      ? pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.vol)} ${y(p.ret)}`).join(" ")
      : "";

  // y gridlines (expected return)
  const yTicks = 4;
  const gridY = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = yMin - yPad + ((yMax - yPad - (yMin - yPad) + 2 * yPad) * i) / yTicks;
    return v;
  });

  return (
    <div ref={ref} className="h-full w-full">
      {W > 0 && (
        <svg width={W} height={H} role="img" aria-label="Efficient frontier of expected return versus volatility">
          <defs>
            <linearGradient id="frontierFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={accent} stopOpacity="0.16" />
              <stop offset="1" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridY.map((v, i) => (
            <g key={i}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(v)}
                y2={y(v)}
                stroke="rgba(148,163,184,0.08)"
              />
              <text
                x={PAD.l - 8}
                y={y(v) + 3}
                textAnchor="end"
                fill="var(--color-faint)"
                className="font-mono"
                style={{ fontSize: 9.5 }}
              >
                {fmtPct(v, 0)}
              </text>
            </g>
          ))}

          {/* frontier area + line */}
          {linePath && (
            <>
              <motion.path
                d={`${linePath} L ${x(pts[pts.length - 1].vol)} ${H - PAD.b} L ${x(pts[0].vol)} ${H - PAD.b} Z`}
                fill="url(#frontierFill)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              />
              <motion.path
                d={linePath}
                fill="none"
                stroke={accent}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0.4 }}
                animate={{ pathLength: 1, opacity: 0.85 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </>
          )}

          {/* connector between current and optimized */}
          <line
            x1={x(result.current.vol)}
            y1={y(result.current.ret)}
            x2={x(result.target.vol)}
            y2={y(result.target.ret)}
            stroke="rgba(255,255,255,0.18)"
            strokeDasharray="3 4"
          />

          {/* current marker */}
          <circle
            cx={x(result.current.vol)}
            cy={y(result.current.ret)}
            r={5}
            fill="#0a0a0a"
            stroke="rgba(255,255,255,0.7)"
            strokeWidth={1.6}
          />
          {/* optimized marker */}
          <motion.circle
            cx={x(result.target.vol)}
            cy={y(result.target.ret)}
            r={6}
            fill={accent}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 26, delay: 0.3 }}
          />
          <circle
            cx={x(result.target.vol)}
            cy={y(result.target.ret)}
            r={11}
            fill="none"
            stroke={accent}
            strokeOpacity={0.3}
          />

          {/* axis labels */}
          <text
            x={W - PAD.r}
            y={H - 10}
            textAnchor="end"
            fill="var(--color-faint)"
            className="font-mono"
            style={{ fontSize: 10, letterSpacing: "0.08em" }}
          >
            VOLATILITY →
          </text>
          <text
            x={16}
            y={PAD.t + 2}
            transform={`rotate(-90 16 ${PAD.t + 2})`}
            textAnchor="end"
            fill="var(--color-faint)"
            className="font-mono"
            style={{ fontSize: 10, letterSpacing: "0.08em" }}
          >
            EXP. RETURN →
          </text>

          {/* x ticks at endpoints */}
          <text x={x(result.current.vol)} y={H - PAD.b + 16} textAnchor="middle" fill="var(--color-faint)" className="font-mono" style={{ fontSize: 9.5 }}>
            {fmtPct(result.current.vol, 0)}
          </text>
          <text x={x(result.target.vol)} y={H - PAD.b + 16} textAnchor="middle" fill={accent} className="font-mono" style={{ fontSize: 9.5 }}>
            {fmtPct(result.target.vol, 0)}
          </text>
        </svg>
      )}
    </div>
  );
}

/* ─────────────────────────────── allocation ─────────────────────────────── */

function AllocationCard({ result }: { result: OptimizerResult }) {
  const rows = useMemo(
    () =>
      [...result.positions]
        .filter((p) => p.currentWeight > 1e-4 || p.targetWeight > 1e-4)
        .sort((a, b) => b.targetWeight - a.targetWeight)
        .slice(0, 14),
    [result]
  );
  const colorOf = useMemo(() => {
    const m: Record<string, string> = {};
    result.positions.forEach((p, i) => (m[p.symbol] = PALETTE[i % PALETTE.length]));
    return m;
  }, [result]);

  const scaleMax =
    Math.max(
      ...rows.flatMap((r) => [r.currentWeight, r.targetWeight]),
      0.01
    ) * 1.08;

  return (
    <Card className="px-6 py-5" hover={false}>
      <CardHeader
        eyebrow="Allocation"
        title="Current → optimized weights"
        right={
          <div className="flex items-center gap-3 font-mono text-[10px] text-faint">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-white/25" /> now
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-px bg-mint" /> target
            </span>
          </div>
        }
        className="mb-4"
      />
      <div className="space-y-3">
        {rows.map((r, i) => {
          const color = colorOf[r.symbol] ?? PALETTE[i % PALETTE.length];
          const neg = r.deltaWeight < 0;
          const buying = r.deltaWeight > 0.001;
          return (
            <motion.div
              key={r.symbol}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.025 }}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-mono text-[12px] text-ink">{r.symbol}</span>
                <span className="flex items-center gap-2 font-mono tnum text-[11px]">
                  <span className="text-faint">{fmtPct(r.currentWeight, 1)}</span>
                  <span className="text-faint">→</span>
                  <span className="text-ink">{fmtPct(r.targetWeight, 1)}</span>
                  {Math.abs(r.deltaWeight) > 0.001 && (
                    <span className={`w-[52px] text-right ${neg ? "text-neg" : "text-pos"}`}>
                      {neg ? "−" : "+"}
                      {fmtPct(Math.abs(r.deltaWeight), 1)}
                    </span>
                  )}
                </span>
              </div>
              <div className="relative h-[11px] overflow-visible rounded-full bg-white/[0.04]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-white/[0.16]"
                  style={{ width: `${(r.currentWeight / scaleMax) * 100}%` }}
                />
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(r.targetWeight / scaleMax) * 100}%` }}
                  transition={{ duration: 0.7, delay: 0.08 + i * 0.025, ease: [0.22, 1, 0.36, 1] }}
                />
                {/* The slice being added to a name that's being bought — a subtle
                    glow on just the new capital, from the current edge to target. */}
                {buying && (
                  <motion.div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      left: `${(r.currentWeight / scaleMax) * 100}%`,
                      background: `color-mix(in srgb, ${color} 88%, white)`,
                      boxShadow: `0 0 9px 1px color-mix(in srgb, ${color} 65%, transparent)`,
                    }}
                    initial={{ width: 0, opacity: 0 }}
                    animate={{
                      width: `${((r.targetWeight - r.currentWeight) / scaleMax) * 100}%`,
                      opacity: 1,
                    }}
                    transition={{ duration: 0.7, delay: 0.12 + i * 0.025, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

/* ───────────────────────────────── trades ───────────────────────────────── */

function tradesToText(result: OptimizerResult): string {
  const head = `Optimize → ${result.objective} · turnover ${fmtPct(result.turnover, 1)}`;
  const rows = result.positions
    .filter((p) => p.action === "buy" || p.action === "sell" || p.action === "exit")
    .sort((a, b) => Math.abs(b.dollarDelta) - Math.abs(a.dollarDelta))
    .map(
      (p) =>
        `${p.action.toUpperCase().padEnd(4)} ${fmtUSD(Math.abs(p.dollarDelta)).padStart(12)}  ${fmtShares(Math.abs(p.shares))} sh  ${p.symbol}`
    );
  if (rows.length === 0) rows.push("(already optimal — no trades)");
  return [head, ...rows].join("\n");
}

function tradesToCSV(result: OptimizerResult): string {
  const header =
    "symbol,action,dollars,shares,price,currentWeightPct,targetWeightPct";
  const rows = result.positions
    .filter((p) => p.action === "buy" || p.action === "sell" || p.action === "exit")
    .sort((a, b) => Math.abs(b.dollarDelta) - Math.abs(a.dollarDelta))
    .map((p) =>
      [
        p.symbol,
        p.action,
        p.dollarDelta.toFixed(2),
        p.shares.toFixed(4),
        p.price.toFixed(2),
        (p.currentTotalWeight * 100).toFixed(2),
        (p.targetTotalWeight * 100).toFixed(2),
      ].join(",")
    );
  return [header, ...rows].join("\n");
}

function TradeTicket({ result }: { result: OptimizerResult }) {
  const [copied, setCopied] = useState(false);
  const colorOf = useMemo(() => {
    const m: Record<string, string> = {};
    result.positions.forEach((p, i) => (m[p.symbol] = PALETTE[i % PALETTE.length]));
    return m;
  }, [result]);

  const trades = useMemo(
    () =>
      result.positions
        .filter((p) => p.action === "buy" || p.action === "sell" || p.action === "exit")
        .sort((a, b) => Math.abs(b.dollarDelta) - Math.abs(a.dollarDelta)),
    [result]
  );

  const copy = () => {
    navigator.clipboard?.writeText(tradesToText(result)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  const download = () => {
    const blob = new Blob([tradesToCSV(result)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alpha-optimize-${result.objective}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="px-6 py-5" hover={false}>
      <CardHeader
        eyebrow="Order ticket"
        title={`Rebalance to optimal · ${result.buys} buys · ${result.sells} sells`}
        right={
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="rounded-md border border-edge px-2.5 py-1 text-[11px] text-mute transition-colors hover:text-ink"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
            <button
              onClick={download}
              className="rounded-md border border-edge px-2.5 py-1 text-[11px] text-mute transition-colors hover:text-ink"
            >
              CSV
            </button>
          </div>
        }
        className="mb-4"
      />
      {trades.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-faint">
          Already at the optimal mix — no trades needed.
        </div>
      ) : (
        <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
          {trades.map((t, i) => {
            const sell = t.action === "sell" || t.action === "exit";
            return (
              <motion.div
                key={t.symbol}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]"
              >
                <TickerLogo
                  symbol={t.symbol}
                  accent={colorOf[t.symbol] ?? PALETTE[i % PALETTE.length]}
                  size={28}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[13px] font-medium text-ink">
                    {t.symbol}
                  </div>
                  <div className="max-w-[160px] truncate text-[11px] text-faint">
                    {t.name}
                  </div>
                </div>
                <span
                  className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide ${
                    sell ? "bg-neg/15 text-neg" : "bg-pos/15 text-pos"
                  }`}
                >
                  {t.action}
                </span>
                <div className="w-[96px] text-right">
                  <div className="font-mono tnum text-[13px] text-ink">
                    {fmtUSD(Math.abs(t.dollarDelta))}
                  </div>
                  <div className="font-mono tnum text-[11px] text-faint">
                    {fmtShares(Math.abs(t.shares))} sh
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      <p className="mt-4 border-t border-edge pt-3 text-[11.5px] leading-relaxed text-faint">
        Estimated from current prices to move from your weights to the optimized
        mix while holding the cash sleeve constant. Not trade advice.
      </p>
    </Card>
  );
}

/* ────────────────────────────── AI review card ──────────────────────────── */

function metricsToPct(m: PortfolioMetrics): OptimizerRequest["before"] {
  return {
    expectedReturnPct: +(m.expectedReturn * 100).toFixed(2),
    volatilityPct: +(m.volatility * 100).toFixed(2),
    sharpe: +m.sharpe.toFixed(2),
    diversification: +m.diversification.toFixed(2),
    effectiveN: +m.effectiveN.toFixed(1),
    topWeightPct: +(m.topWeight * 100).toFixed(1),
    yieldPct: +(m.yield * 100).toFixed(2),
    beta: +m.beta.toFixed(2),
  };
}

function buildReviewRequest(
  portfolio: Portfolio,
  result: OptimizerResult,
  objectiveLabel: string
): OptimizerRequest {
  const fundBySym = new Map(
    portfolio.positions.map((p) => [p.symbol, p.fundamentals])
  );
  const shifts = [...result.positions]
    .filter((p) => Math.abs(p.deltaWeight) >= 0.001)
    .sort((a, b) => Math.abs(b.deltaWeight) - Math.abs(a.deltaWeight))
    .slice(0, 16)
    .map((p) => {
      const f = fundBySym.get(p.symbol) ?? null;
      return {
        symbol: p.symbol,
        name: p.name,
        sector: p.sector,
        currentPct: +(p.currentWeight * 100).toFixed(2),
        targetPct: +(p.targetWeight * 100).toFixed(2),
        deltaPct: +(p.deltaWeight * 100).toFixed(2),
        forwardPE: f?.forwardPE ?? null,
        dividendYieldPct: f ? +(f.dividendYield * 100).toFixed(2) : null,
        roicPct: f ? +(f.roic * 100).toFixed(1) : null,
        beta: f ? +f.beta.toFixed(2) : null,
        volPct: f ? +(f.volatility * 100).toFixed(0) : null,
      };
    });

  return {
    objective: { id: result.objective, label: objectiveLabel },
    constraints: {
      maxWeightPct: +(result.constraints.maxWeight * 100).toFixed(0),
      // When exits are allowed there is no held-position floor.
      minWeightPct: +(
        (result.constraints.allowExit ? 0 : result.constraints.minWeight) * 100
      ).toFixed(1),
    },
    before: metricsToPct(result.metricsBefore),
    after: metricsToPct(result.metricsAfter),
    turnoverPct: +(result.turnover * 100).toFixed(1),
    cashWeightPct: +(result.cashWeight * 100).toFixed(1),
    shifts,
  };
}

type ReviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: OptimizerResponse };

/** Button-triggered (it's a reasoning model): the user opts into the review. */
function useOptimizerReview(
  portfolio: Portfolio,
  result: OptimizerResult,
  objectiveLabel: string
) {
  const [state, setState] = useState<ReviewState>({ kind: "idle" });

  // Reset the review whenever the objective, constraints, or holdings change —
  // the previous read no longer describes what's on screen.
  const sig = `${result.objective}|${result.constraints.maxWeight}|${result.constraints.minWeight}|${result.constraints.allowExit}|${portfolio.positions.map((p) => p.symbol).sort().join(",")}`;
  const sigRef = useRef(sig);
  useEffect(() => {
    if (sigRef.current !== sig) {
      sigRef.current = sig;
      setState({ kind: "idle" });
    }
  }, [sig]);

  // Keep the latest result/label without forcing the callback identity to churn.
  const ctxRef = useRef({ portfolio, result, objectiveLabel });
  ctxRef.current = { portfolio, result, objectiveLabel };

  const generate = useCallback(async () => {
    setState({ kind: "loading" });
    const { portfolio: p, result: r, objectiveLabel: l } = ctxRef.current;
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildReviewRequest(p, r, l)),
      });
      if (res.status === 401) {
        window.location.replace("/lock");
        return;
      }
      if (res.status === 501) {
        setState({ kind: "disabled" });
        return;
      }
      if (res.status === 429) {
        setState({
          kind: "error",
          message: "AI optimizer is rate limited — try again shortly.",
        });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string"
            ? `${body.error} (${res.status})`
            : `HTTP ${res.status}`
        );
      }
      setState({ kind: "ready", data: (await res.json()) as OptimizerResponse });
    } catch (err) {
      console.error("Optimizer review failed:", err);
      let msg =
        err instanceof Error && err.message
          ? `AI optimizer unavailable: ${err.message}`
          : "AI optimizer unreachable.";
      if (err instanceof Error && err.message.includes("Failed to fetch")) {
        msg = "Network error — make sure the app is deployed and reachable.";
      }
      setState({ kind: "error", message: msg });
    }
  }, []);

  return { state, generate };
}

function ReviewCard({
  portfolio,
  result,
  objectiveLabel,
  accent,
}: {
  portfolio: Portfolio;
  result: OptimizerResult;
  objectiveLabel: string;
  accent: string;
}) {
  const { state, generate } = useOptimizerReview(portfolio, result, objectiveLabel);

  if (state.kind === "disabled") {
    return (
      <Card className="mt-5 px-6 py-4" hover={false}>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-faint">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
          AI optimizer is off — set
          <code className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px]">
            ANTHROPIC_API_KEY
          </code>
          to have Claude Sonnet 4.6 review the optimization and write the desk note.
        </div>
      </Card>
    );
  }

  const plan = state.kind === "ready" ? state.data.plan : null;

  return (
    <Card className="mt-5 px-6 py-5 sm:px-7" hover={false}>
      <CardHeader
        eyebrow="AI · Sonnet 4.6"
        title="Construction review"
        right={
          plan ? (
            <button
              onClick={generate}
              className="rounded-md border border-edge px-2.5 py-1 text-[11px] text-mute transition-colors hover:text-ink"
            >
              Regenerate
            </button>
          ) : undefined
        }
        className="mb-4"
      />

      {state.kind === "idle" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="max-w-2xl text-[12.5px] leading-relaxed text-mute">
            Claude reads the{" "}
            <span className="font-mono text-ink">{objectiveLabel}</span> solution —
            the weight moves, the risk/return deltas, the turnover — and writes the
            institutional read: what the optimizer did, the tradeoffs you take on,
            the risk that remains, and whether it&apos;s worth implementing. A
            reasoning model on your snapshot, not advice.
          </p>
          <button onClick={generate} className="btn-primary">
            Review with AI
          </button>
        </div>
      )}

      {state.kind === "loading" && (
        <div className="relative h-[200px]">
          <Computing active label="reasoning through the tradeoffs…" />
        </div>
      )}

      {state.kind === "error" && (
        <div className="flex h-[180px] flex-col items-center justify-center gap-3 text-center">
          <div className="text-[13px] text-mute max-w-md">{state.message}</div>
          <button onClick={generate} className="btn-secondary">
            Retry
          </button>
        </div>
      )}

      {plan && (
        <ReviewBody
          plan={plan}
          accent={accent}
          meta={state.kind === "ready" ? state.data : null}
        />
      )}
    </Card>
  );
}

function ReviewBody({
  plan,
  accent,
  meta,
}: {
  plan: OptimizerPlan;
  accent: string;
  meta: OptimizerResponse | null;
}) {
  const conv = CONVICTION[plan.confidence] ?? CONVICTION.low;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <p className="max-w-3xl text-[13.5px] leading-relaxed text-ink">{plan.thesis}</p>
      <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-mute">
        {plan.assessment}
      </p>

      {plan.keyShifts.length > 0 && (
        <div className="mt-5">
          <div className="eyebrow mb-2.5">key shifts</div>
          <div className="space-y-2">
            {plan.keyShifts.map((s, i) => {
              const m = SHIFT_META[s.action] ?? SHIFT_META.increase;
              return (
                <motion.div
                  key={`${s.symbol}-${i}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-start gap-2.5"
                >
                  <span
                    className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide ${m.cls}`}
                  >
                    {m.label}
                  </span>
                  <span className="text-[12.5px] leading-snug text-mute">
                    <span className="font-mono font-medium text-ink">{s.symbol}</span>{" "}
                    — {s.detail}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {plan.tradeoffs.length > 0 && (
          <div>
            <div className="eyebrow mb-2.5">tradeoffs</div>
            <div className="space-y-3">
              {plan.tradeoffs.map((t) => (
                <div
                  key={t.title}
                  className="rounded-lg border border-edge bg-void/40 px-3.5 py-3"
                >
                  <div className="text-[12.5px] font-medium text-ink">{t.title}</div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-mute">
                    {t.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        {plan.risks.length > 0 && (
          <div>
            <div className="eyebrow mb-2.5">residual risk</div>
            <div className="space-y-3">
              {plan.risks.map((r) => (
                <div
                  key={r.title}
                  className="rounded-lg border-l-2 border-edge2 bg-void/30 px-3.5 py-3"
                >
                  <div className="text-[12.5px] font-medium text-ink">{r.title}</div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-mute">
                    {r.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="mt-5 rounded-lg px-4 py-3.5"
        style={{ background: `color-mix(in srgb, ${accent} 7%, #0a0a0a)` }}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="eyebrow" style={{ color: accent }}>
            verdict
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide ${conv.cls}`}
          >
            {conv.label}
          </span>
        </div>
        <p className="max-w-3xl text-[12.5px] leading-relaxed text-ink">
          {plan.verdict}
        </p>
      </div>

      <p className="mt-4 border-t border-edge pt-3 text-[11px] leading-relaxed text-faint">
        Reasoning from Claude Sonnet 4.6 on the optimization snapshot. The weights
        are solved quantitatively; this is a read on them, not investment advice.{" "}
        {meta && (
          <span className="font-mono">
            {meta.cached ? "cached · " : ""}
            {relativeTime(meta.generatedAt)}
            {typeof meta.costUSD === "number" &&
              ` · est. cost ${fmtCostUSD(meta.costUSD)}`}
          </span>
        )}
      </p>
    </motion.div>
  );
}

/** Compact USD cost — sub-cent figures need more precision than $0.00. */
function fmtCostUSD(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}
