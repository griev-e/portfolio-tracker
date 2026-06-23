"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { fmtPct } from "@/lib/format";
import type { LayerResult, SignalResult } from "@/lib/analytics/regime/types";
import { fmtScore, ScoreBar, scoreTone } from "./regimeUi";

/** Compact "fingerprint" of a layer's signals — one centered bar per signal. */
function SignalSparkbar({ signals }: { signals: SignalResult[] }) {
  return (
    <div className="flex h-6 items-center gap-[3px]">
      {signals.map((s) => {
        const up = s.score >= 0;
        const mag = Math.max(0.08, Math.min(1, Math.abs(s.score)));
        return (
          <div
            key={s.id}
            className="relative h-full w-[5px]"
            title={`${s.label}: ${fmtScore(s.score)}`}
          >
            <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
            <motion.div
              className="absolute inset-x-0 rounded-[1px]"
              style={{
                background: up ? "var(--color-pos)" : "var(--color-neg)",
                opacity: 0.85,
                ...(up ? { bottom: "50%" } : { top: "50%" }),
              }}
              initial={{ height: 0 }}
              animate={{ height: `${mag * 50}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function LayerCard({ layer, i }: { layer: LayerResult; i: number }) {
  const [open, setOpen] = useState(false);
  const s = layer.score;
  const hasSignals = layer.signals.length > 0;

  return (
    <Card
      className="flex flex-col px-4 py-4 transition-transform duration-300 hover:-translate-y-0.5"
      i={i * 0.4 + 2}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[13px] font-medium text-ink">{layer.name}</div>
        <Tooltip
          underline={false}
          content="Weight — how much this layer counts toward the overall regime score. It's earned each day from the layer's data coverage, how strongly its own signals agree, and how steady it's been over the past month, then renormalized so all eight layers sum to 100%."
        >
          <span className="rounded border border-edge bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9.5px] text-faint">
            w {fmtPct(layer.weight, 0)}
          </span>
        </Tooltip>
      </div>
      <div className="mt-0.5 text-[10.5px] text-faint">{layer.question}</div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={`font-mono tnum text-[26px] font-medium leading-none ${
            s === null ? "text-faint" : scoreTone(s)
          }`}
        >
          {s === null ? "—" : fmtScore(s)}
        </span>
        {layer.delta21 !== null && Math.abs(layer.delta21) >= 0.05 && (
          <span
            className={`font-mono tnum text-[11px] ${
              layer.delta21 > 0 ? "text-pos" : "text-neg"
            }`}
            title="Change vs one month ago"
          >
            {layer.delta21 > 0 ? "▲" : "▼"} {fmtScore(layer.delta21)}/1m
          </span>
        )}
      </div>
      <ScoreBar score={s ?? 0} className="mt-2.5" delay={i * 0.04 + 0.3} />

      <p className="mt-3 min-h-[2.4em] text-[11.5px] leading-snug text-mute">
        {layer.summary}
      </p>

      {hasSignals && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="group mt-3 flex items-center justify-between gap-3 border-t border-edge pt-3 text-left"
            aria-expanded={open}
          >
            <SignalSparkbar signals={layer.signals} />
            <span className="flex shrink-0 items-center gap-1 font-mono text-[9.5px] uppercase tracking-wide text-faint transition-colors group-hover:text-mute">
              {open ? "Hide" : `${layer.signals.length} signals`}
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
                ⌄
              </motion.span>
            </span>
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-1.5">
                  {layer.signals.map((sg) => (
                    <div key={sg.id} className="flex items-center gap-2" title={sg.detail}>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-mute">
                        {sg.label}
                      </span>
                      <ScoreBar score={sg.score} height={4} className="w-14 shrink-0" />
                      <span
                        className={`w-8 shrink-0 text-right font-mono tnum text-[10.5px] ${scoreTone(sg.score)}`}
                      >
                        {fmtScore(sg.score)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-1 font-mono text-[9.5px] text-faint">
                  <Tooltip content="Agreement — how strongly this layer's own signals point the same way (0–1). High means they reinforce each other; low means the signals are mixed.">
                    <span>agreement</span>
                  </Tooltip>
                  {layer.coherence === null ? "—" : layer.coherence.toFixed(2)} ·{" "}
                  <Tooltip content="Stability — how steady this layer's reading has been over the past month (0–1). Higher is a calmer, more reliable signal; lower means it's been swinging around.">
                    <span>stability</span>
                  </Tooltip>
                  {layer.stability === null ? "—" : layer.stability.toFixed(2)} ·{" "}
                  <Tooltip content="Data — the share of this layer's underlying index series that were available for today's reading.">
                    <span>data</span>
                  </Tooltip>
                  {fmtPct(layer.coverage, 0)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </Card>
  );
}
