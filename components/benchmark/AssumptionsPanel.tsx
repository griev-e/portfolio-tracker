"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { useAssumptions, type FieldPath } from "@/lib/assumptions/store";
import {
  ASSUMPTION_PRESETS,
  FUNDAMENTAL_BARS,
  SCALAR_BARS,
  fundamentalTicks,
  type BenchmarkFundamentalAssumptions,
  type PresetId,
} from "@/lib/data/assumptions";
import { fmtPct } from "@/lib/format";

const fmt = (v: number, format: "pct" | "pct1") =>
  format === "pct1" ? fmtPct(v, 2) : fmtPct(v, 1);

/** Plain-language explanation per field, surfaced on the label tooltip. */
const TIPS: Record<string, string> = {
  equityRiskPremium:
    "The extra annual return investors demand for holding stocks over the risk-free rate. No instrument quotes it, so it's an assumption (~4–5% long-run). Drives CAPM expected returns on the Risk page and the optimizer.",
  dividendGrowth:
    "The S&P 500's long-run annual dividend growth — the yardstick the Dividends engine scores your holdings' dividend growth against (~6%/yr historically).",
  revenueGrowth:
    "Aggregate forward revenue growth for the index. The benchmark your portfolio's weighted revenue growth is graded against on the Quality page.",
  epsGrowth:
    "Aggregate earnings-per-share growth for the index — the growth benchmark for the quality scorecard.",
  fcfGrowth: "Aggregate free-cash-flow growth for the index.",
  roic: "Aggregate return on invested capital for the index — a core profitability/quality benchmark.",
  operatingMargin: "Aggregate operating margin for the index — an efficiency benchmark.",
  grossMargin: "Aggregate gross margin for the index — a pricing-power benchmark.",
};

/** One labeled slider with a custom fill track and collision-free ticks. */
function Bar({
  label,
  tip,
  value,
  min,
  max,
  step,
  format,
  ticks,
  onChange,
}: {
  label: string;
  tip: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: "pct" | "pct1";
  ticks: { at: number; label: string }[];
  onChange: (v: number) => void;
}) {
  const span = max - min || 1;
  const clampPct = (v: number) => Math.min(100, Math.max(0, ((v - min) / span) * 100));
  const fill = `${clampPct(value)}%`;
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between">
        <Tooltip content={tip} maxWidth={240}>
          <span className="text-[12px] text-mute">{label}</span>
        </Tooltip>
        <span className="font-mono tnum text-[12.5px] font-medium text-ink">
          {fmt(value, format)}
        </span>
      </div>

      {/* Custom track: background + mint fill + thumb, with a transparent native
          range on top doing the actual interaction (keyboard + drag + a11y). */}
      <div className="relative mt-2 h-4 select-none">
        <div className="absolute left-0 top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-edge2/50" />
        <div
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-mint/70 transition-[width] duration-150 ease-out"
          style={{ width: fill }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mint shadow-[0_0_0_3px_var(--color-bg)] transition-[left] duration-150 ease-out"
          style={{ left: fill }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={label}
        />
      </div>

      {/* Reference ticks. Labels alternate vertical rows so neighbours that sit
          close together (e.g. Today vs 10-yr) never overlap. */}
      <div className="relative mt-1 h-6">
        {ticks.map((t, i) => (
          <div
            key={t.label}
            className="absolute flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${clampPct(t.at)}%` }}
          >
            <div className="h-1.5 w-px bg-edge2" />
            <div
              className="font-mono text-[8.5px] leading-none text-faint"
              style={{ marginTop: i % 2 === 0 ? 2 : 12 }}
            >
              {t.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PRESET_LABEL: Record<PresetId, string> = {
  today: "Market today",
  average: "10-year average",
  recession: "Recession",
};

export function AssumptionsPanel() {
  const { assumptions, preset, setField, applyPreset, reset } = useAssumptions();
  const [index, setIndex] = useState<"spx" | "ndx">("spx");

  const fundamentalKeys = Object.keys(
    FUNDAMENTAL_BARS
  ) as (keyof BenchmarkFundamentalAssumptions)[];

  return (
    <Card className="px-6 py-5" i={3}>
      <CardHeader
        eyebrow="Market assumptions"
        title="Benchmark inputs you control"
        right={
          <Tooltip
            content="These few values have no live market quote — they're forward assumptions, not data. Index profitability and growth can't be sourced live, so set the backdrop you want to measure against. Everything else on this page is live."
            maxWidth={260}
          >
            <span className="font-mono text-[10px] text-faint">why editable?</span>
          </Tooltip>
        }
        className="mb-4"
      />

      {/* Preset selector */}
      <div className="flex flex-wrap items-center gap-2">
        {ASSUMPTION_PRESETS.map((p) => {
          const active = preset === p.id;
          return (
            <m.button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              whileTap={{ scale: 0.96 }}
              className={`relative rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
                active
                  ? "border-mint/40 text-mint"
                  : "border-edge bg-panel text-mute hover:border-edge2 hover:text-ink"
              }`}
              title={p.detail}
            >
              {active && (
                <m.span
                  layoutId="preset-active"
                  className="absolute inset-0 -z-0 rounded-lg bg-mint/[0.08]"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10">{PRESET_LABEL[p.id]}</span>
            </m.button>
          );
        })}
        <m.span
          animate={{ opacity: preset === null ? 1 : 0.55 }}
          className={`rounded-lg border px-3 py-1.5 text-[12px] ${
            preset === null
              ? "border-warn/35 bg-warn/[0.07] text-warn"
              : "border-transparent text-faint"
          }`}
        >
          Custom
        </m.span>
        <button
          type="button"
          onClick={reset}
          className="ml-auto font-mono text-[11px] text-faint underline decoration-dotted underline-offset-2 transition-colors hover:text-mute"
        >
          Reset to default
        </button>
      </div>

      <div className="mt-5 grid gap-x-10 gap-y-2 md:grid-cols-2">
        {/* Scalar assumptions */}
        <div>
          <div className="eyebrow mb-1.5 text-faint">Market-wide</div>
          <Bar
            label={SCALAR_BARS.equityRiskPremium.label}
            tip={TIPS.equityRiskPremium}
            value={assumptions.equityRiskPremium}
            min={SCALAR_BARS.equityRiskPremium.min}
            max={SCALAR_BARS.equityRiskPremium.max}
            step={SCALAR_BARS.equityRiskPremium.step}
            format={SCALAR_BARS.equityRiskPremium.format}
            ticks={SCALAR_BARS.equityRiskPremium.ticks}
            onChange={(v) => setField({ scope: "scalar", key: "equityRiskPremium" }, v)}
          />
          <Bar
            label={SCALAR_BARS.dividendGrowth.label}
            tip={TIPS.dividendGrowth}
            value={assumptions.dividendGrowth}
            min={SCALAR_BARS.dividendGrowth.min}
            max={SCALAR_BARS.dividendGrowth.max}
            step={SCALAR_BARS.dividendGrowth.step}
            format={SCALAR_BARS.dividendGrowth.format}
            ticks={SCALAR_BARS.dividendGrowth.ticks}
            onChange={(v) => setField({ scope: "scalar", key: "dividendGrowth" }, v)}
          />
        </div>

        {/* Per-index profitability & growth */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="eyebrow text-faint">Index profitability &amp; growth</span>
            <div className="flex gap-1">
              {(["spx", "ndx"] as const).map((id) => (
                <m.button
                  key={id}
                  type="button"
                  onClick={() => setIndex(id)}
                  whileTap={{ scale: 0.95 }}
                  className={`rounded-md border px-2 py-0.5 font-mono text-[10.5px] transition-colors ${
                    index === id
                      ? "border-mint/40 bg-mint/[0.08] text-mint"
                      : "border-edge text-faint hover:border-edge2 hover:text-mute"
                  }`}
                >
                  {id === "spx" ? "S&P 500" : "NDX-100"}
                </m.button>
              ))}
            </div>
          </div>
          {fundamentalKeys.map((key) => {
            const spec = FUNDAMENTAL_BARS[key];
            const path: FieldPath = { scope: "index", index, key };
            return (
              <Bar
                key={`${index}:${key}`}
                label={spec.label}
                tip={TIPS[key]}
                value={assumptions[index][key]}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                format={spec.format}
                ticks={fundamentalTicks(index, key)}
                onChange={(v) => setField(path, v)}
              />
            );
          })}
        </div>
      </div>
    </Card>
  );
}
