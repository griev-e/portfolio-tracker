"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardHeader } from "@/components/ui/Card";
import { Computing } from "@/components/ui/Computing";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import {
  runScenario,
  scenarioPresets,
} from "@/lib/analytics/scenarios";
import { fmtPct, fmtUSD } from "@/lib/format";
import { usePortfolio } from "@/lib/store";
import type { ScenarioShock } from "@/lib/types";
import { useAsyncCompute } from "@/lib/useAsyncCompute";

type Kind = "stock" | "market" | "rates";

export default function ScenariosPage() {
  const { ready, portfolio } = usePortfolio();

  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("stock");
  const [symbol, setSymbol] = useState<string | null>(null);
  const [magnitude, setMagnitude] = useState(-20); // % for stock/market, bp/100 for rates
  const [rateMove, setRateMove] = useState(1.0);
  // No scenario is run until the user picks a preset or touches a custom
  // control — the results panel starts empty rather than auto-shocking.
  const [customActive, setCustomActive] = useState(false);

  const presets = useMemo(
    () => (portfolio ? scenarioPresets(portfolio) : []),
    [portfolio]
  );

  const shock: ScenarioShock | null = useMemo(() => {
    if (!portfolio) return null;
    const preset = presets.find((p) => p.id === activePreset);
    if (preset) return preset.shock;
    if (!customActive) return null; // nothing chosen yet
    if (kind === "stock") {
      const sym = symbol ?? portfolio.positions[0]?.symbol;
      if (!sym) return null;
      return { kind, symbol: sym, magnitude: magnitude / 100 };
    }
    if (kind === "market") return { kind, magnitude: magnitude / 100 };
    return { kind, magnitude: rateMove };
  }, [portfolio, presets, activePreset, customActive, kind, symbol, magnitude, rateMove]);

  const label = useMemo(() => {
    const preset = presets.find((p) => p.id === activePreset);
    if (preset) return preset.label;
    if (!shock) return "";
    if (shock.kind === "stock")
      return `${shock.symbol} ${fmtPct(shock.magnitude, 0, true)}`;
    if (shock.kind === "market")
      return `Market ${fmtPct(shock.magnitude, 0, true)}`;
    return `Rates ${shock.magnitude > 0 ? "+" : ""}${(shock.magnitude * 100).toFixed(0)}bp`;
  }, [presets, activePreset, shock]);

  const { value: result, pending } = useAsyncCompute(
    () => (portfolio && shock ? runScenario(portfolio, shock, label) : null),
    [portfolio, shock, label]
  );

  if (!ready) return null;
  if (!portfolio) return <EmptyState page="Scenario analysis" />;

  const maxAbs = result
    ? Math.max(...result.impacts.map((x) => Math.abs(x.dollarImpact)), 1)
    : 1;

  return (
    <div>
      <PageHeader
        eyebrow="Simulation"
        title="Scenario Analysis"
        description="Stress the book with single-name shocks (with correlated spillover), broad market moves, and rate shifts. Estimates, not guarantees."
      />

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        {/* Controls */}
        <div className="space-y-5">
          <Card className="px-5 py-5" i={0}>
            <CardHeader eyebrow="Presets" title="One-tap stress tests" className="mb-4" />
            <div className="grid grid-cols-2 gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePreset(activePreset === p.id ? null : p.id)}
                  title={p.detail}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                    activePreset === p.id
                      ? "border-mint/40 bg-mint/[0.07]"
                      : "border-edge bg-void/40 hover:border-edge2"
                  }`}
                >
                  <div
                    className={`font-mono text-[12.5px] font-medium ${
                      activePreset === p.id ? "text-mint" : "text-ink"
                    }`}
                  >
                    {p.label}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-faint">
                    {p.detail}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="px-5 py-5" i={1}>
            <CardHeader eyebrow="Custom shock" title="Build your own" className="mb-4" />
            <div className="mb-4 flex rounded-lg border border-edge p-1">
              {(["stock", "market", "rates"] as Kind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setKind(k);
                    setActivePreset(null);
                    setCustomActive(true);
                  }}
                  className={`relative flex-1 rounded-md py-1.5 text-[12px] font-medium capitalize transition-colors ${
                    kind === k && !activePreset ? "text-black" : "text-mute hover:text-ink"
                  }`}
                >
                  {kind === k && !activePreset && (
                    <motion.span
                      layoutId="kind-pill"
                      className="absolute inset-0 rounded-md bg-ink"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span className="relative z-10">{k}</span>
                </button>
              ))}
            </div>

            {kind === "stock" && (
              <div className="mb-4">
                <div className="eyebrow mb-2">Holding</div>
                <div className="flex flex-wrap gap-1.5">
                  {portfolio.positions.map((p) => {
                    const sel = (symbol ?? portfolio.positions[0]?.symbol) === p.symbol;
                    return (
                      <button
                        key={p.symbol}
                        onClick={() => {
                          setSymbol(p.symbol);
                          setActivePreset(null);
                          setCustomActive(true);
                        }}
                        className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                          sel && !activePreset
                            ? "border-mint/40 bg-mint/10 text-mint"
                            : "border-edge text-mute hover:text-ink"
                        }`}
                      >
                        {p.symbol}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {kind !== "rates" ? (
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="eyebrow">Move</span>
                  <span
                    className={`font-mono tnum text-[15px] ${magnitude < 0 ? "text-neg" : "text-pos"}`}
                  >
                    {magnitude > 0 ? "+" : ""}
                    {magnitude}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-60}
                  max={40}
                  step={1}
                  value={magnitude}
                  onChange={(e) => {
                    setMagnitude(Number(e.target.value));
                    setActivePreset(null);
                    setCustomActive(true);
                  }}
                  className="w-full"
                />
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="eyebrow">Rate change</span>
                  <span
                    className={`font-mono tnum text-[15px] ${rateMove > 0 ? "text-neg" : "text-pos"}`}
                  >
                    {rateMove > 0 ? "+" : ""}
                    {(rateMove * 100).toFixed(0)}bp
                  </span>
                </div>
                <input
                  type="range"
                  min={-2}
                  max={3}
                  step={0.25}
                  value={rateMove}
                  onChange={(e) => {
                    setRateMove(Number(e.target.value));
                    setActivePreset(null);
                    setCustomActive(true);
                  }}
                  className="w-full"
                />
              </div>
            )}
          </Card>
        </div>

        {/* Results */}
        <div className="relative min-w-0">
          {!shock ? (
            <div className="panel flex h-[420px] flex-col items-center justify-center gap-3 px-8 text-center">
              <div className="text-[14px] font-medium text-mute">
                No scenario selected
              </div>
              <p className="max-w-sm text-[12.5px] leading-relaxed text-faint">
                Pick a preset stress test or build a custom shock on the left,
                and the impact on your book will appear here.
              </p>
            </div>
          ) : (
            <>
              <Computing active={pending || !result} label="applying shock…" />
              {!result && <div className="panel h-[420px]" />}
              <AnimatePresence mode="wait">
                {result && (
              <motion.div
                key={result.label + result.dollarImpact.toFixed(0)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Card className="mb-5 px-6 py-5" hover={false}>
                  <div className="eyebrow mb-3">Scenario · {result.label}</div>
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                    <Stat
                      label="Portfolio impact"
                      value={result.portfolioImpactPct}
                      format={(v) => fmtPct(v, 2, true)}
                      toneClass={result.portfolioImpactPct < 0 ? "text-neg" : "text-pos"}
                    />
                    <Stat
                      label="Dollar impact"
                      value={result.dollarImpact}
                      format={(v) => `${v >= 0 ? "+" : ""}${fmtUSD(v)}`}
                      toneClass={result.dollarImpact < 0 ? "text-neg" : "text-pos"}
                    />
                    <Stat
                      label="Value after"
                      value={result.newTotalValue}
                      format={(v) => fmtUSD(v)}
                    />
                    <Stat
                      label="Cash buffer"
                      value={portfolio.cash}
                      format={(v) => fmtUSD(v)}
                      sub="unaffected"
                    />
                  </div>
                </Card>

                <Card className="px-6 py-5" hover={false}>
                  <CardHeader
                    eyebrow="Impact waterfall"
                    title="Damage by holding"
                    right={
                      <div className="flex items-center gap-3 font-mono text-[10px] text-faint">
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2 w-2 rounded-sm bg-mint/70" /> direct
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2 w-2 rounded-sm bg-sky/50" /> spillover
                        </span>
                      </div>
                    }
                    className="mb-4"
                  />
                  <div className="space-y-2">
                    {result.impacts.map((x, i) => {
                      const frac = Math.abs(x.dollarImpact) / maxAbs;
                      const neg = x.dollarImpact < 0;
                      return (
                        <motion.div
                          key={x.symbol}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className="flex items-center gap-3"
                        >
                          <span className="w-12 shrink-0 font-mono text-[11px] text-mute">
                            {x.symbol}
                          </span>
                          {/* mirrored bar: losses grow left, gains grow right */}
                          <div className="relative h-[18px] flex-1">
                            <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
                            <motion.div
                              className="absolute top-1/2 h-[10px] -translate-y-1/2 rounded-full"
                              style={{
                                background: neg
                                  ? `linear-gradient(270deg, ${x.isDirect ? "rgba(251,113,133,0.9)" : "rgba(251,113,133,0.45)"}, rgba(251,113,133,0.12))`
                                  : `linear-gradient(90deg, rgba(52,211,153,0.12), ${x.isDirect ? "rgba(52,211,153,0.9)" : "rgba(52,211,153,0.45)"})`,
                                ...(neg
                                  ? { right: "50%", transformOrigin: "right" }
                                  : { left: "50%", transformOrigin: "left" }),
                              }}
                              initial={{ width: 0 }}
                              animate={{ width: `${frac * 48}%` }}
                              transition={{ duration: 0.6, delay: 0.1 + i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                            />
                          </div>
                          <span
                            className={`w-24 shrink-0 text-right font-mono tnum text-[12px] ${
                              neg ? "text-neg" : "text-pos"
                            }`}
                          >
                            {x.dollarImpact >= 0 ? "+" : ""}
                            {fmtUSD(x.dollarImpact)}
                          </span>
                          <span className="w-14 shrink-0 text-right font-mono tnum text-[11px] text-faint">
                            {fmtPct(x.shockPct, 1, true)}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                  <p className="mt-4 border-t border-edge pt-3 text-[11.5px] leading-relaxed text-faint">
                    Single-name shocks propagate to other holdings at 45% of the
                    correlation-implied link — company-specific news rarely
                    transmits in full. Rate shocks scale with valuation multiples
                    (long-duration growth compresses hardest) and sector
                    (financials benefit, bond proxies suffer).
                  </p>
                </Card>
              </motion.div>
            )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
