"use client";

import { useState } from "react";
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

/** One labeled slider with a value readout and reference ticks. */
function Bar({
  label,
  value,
  min,
  max,
  step,
  format,
  ticks,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: "pct" | "pct1";
  ticks: { at: number; label: string }[];
  onChange: (v: number) => void;
}) {
  const span = max - min || 1;
  const posOf = (v: number) =>
    `${Math.min(100, Math.max(0, ((v - min) / span) * 100))}%`;
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-mute">{label}</span>
        <span className="font-mono tnum text-[12.5px] text-ink">
          {fmt(value, format)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1.5 w-full accent-mint"
        aria-label={label}
      />
      {/* Reference ticks: a mark + tiny caption per preset value. */}
      <div className="relative mt-1 h-3.5">
        {ticks.map((t) => (
          <div
            key={t.label}
            className="absolute -translate-x-1/2 text-center"
            style={{ left: posOf(t.at) }}
          >
            <div className="mx-auto h-1 w-px bg-edge2" />
            <div className="font-mono text-[8.5px] leading-tight text-faint">
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
          >
            <span className="font-mono text-[10px] text-faint underline decoration-dotted">
              why editable?
            </span>
          </Tooltip>
        }
        className="mb-4"
      />

      {/* Preset selector */}
      <div className="flex flex-wrap items-center gap-2">
        {ASSUMPTION_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p.id)}
            className={`rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
              preset === p.id
                ? "border-mint/40 bg-mint/[0.08] text-mint"
                : "border-edge bg-panel text-mute hover:border-edge2"
            }`}
            title={p.detail}
          >
            {PRESET_LABEL[p.id]}
          </button>
        ))}
        <span
          className={`rounded-lg border px-3 py-1.5 text-[12px] ${
            preset === null
              ? "border-warn/35 bg-warn/[0.07] text-warn"
              : "border-transparent text-faint"
          }`}
        >
          Custom
        </span>
        <button
          type="button"
          onClick={reset}
          className="ml-auto font-mono text-[11px] text-faint underline decoration-dotted hover:text-mute"
        >
          Reset to default
        </button>
      </div>

      <div className="mt-4 grid gap-x-8 gap-y-1 md:grid-cols-2">
        {/* Scalar assumptions */}
        <div>
          <div className="eyebrow mb-1">Market-wide</div>
          <Bar
            label={SCALAR_BARS.equityRiskPremium.label}
            value={assumptions.equityRiskPremium}
            min={SCALAR_BARS.equityRiskPremium.min}
            max={SCALAR_BARS.equityRiskPremium.max}
            step={SCALAR_BARS.equityRiskPremium.step}
            format={SCALAR_BARS.equityRiskPremium.format}
            ticks={SCALAR_BARS.equityRiskPremium.ticks}
            onChange={(v) =>
              setField({ scope: "scalar", key: "equityRiskPremium" }, v)
            }
          />
          <Bar
            label={SCALAR_BARS.dividendGrowth.label}
            value={assumptions.dividendGrowth}
            min={SCALAR_BARS.dividendGrowth.min}
            max={SCALAR_BARS.dividendGrowth.max}
            step={SCALAR_BARS.dividendGrowth.step}
            format={SCALAR_BARS.dividendGrowth.format}
            ticks={SCALAR_BARS.dividendGrowth.ticks}
            onChange={(v) =>
              setField({ scope: "scalar", key: "dividendGrowth" }, v)
            }
          />
        </div>

        {/* Per-index profitability & growth */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="eyebrow">Index profitability & growth</span>
            <div className="flex gap-1">
              {(["spx", "ndx"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setIndex(id)}
                  className={`rounded-md border px-2 py-0.5 font-mono text-[10.5px] ${
                    index === id
                      ? "border-mint/40 bg-mint/[0.08] text-mint"
                      : "border-edge text-faint hover:border-edge2"
                  }`}
                >
                  {id === "spx" ? "S&P 500" : "NDX-100"}
                </button>
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
