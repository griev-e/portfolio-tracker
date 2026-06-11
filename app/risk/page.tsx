"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Gauge } from "@/components/ui/Gauge";
import { Meter } from "@/components/ui/Meter";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { riskReport } from "@/lib/analytics/risk";
import { CMA, SPX } from "@/lib/data/benchmarks";
import { fmtNum, fmtPct } from "@/lib/format";
import { usePortfolio } from "@/lib/store";

const REGION_COLORS: Record<string, string> = {
  US: "#5EEAD4",
  Europe: "#A78BFA",
  "Asia-Pacific": "#7DD3FC",
  Emerging: "#FCD34D",
};

export default function RiskPage() {
  const { ready, portfolio } = usePortfolio();
  const risk = useMemo(
    () => (portfolio ? riskReport(portfolio, SPX.sectorWeights) : null),
    [portfolio]
  );

  if (!ready) return null;
  if (!portfolio || !risk) return <EmptyState page="Risk analysis" />;

  const concentrationFlag =
    risk.topWeight > 0.2
      ? { text: "Single-name concentration is elevated", tone: "warn" }
      : risk.effectiveN < 8
        ? { text: "Diversification is thinner than it looks", tone: "warn" }
        : { text: "Concentration profile looks healthy", tone: "ok" };

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio"
        title="Risk Analysis"
        description="Estimated from position weights, factor-model correlations, and bundled per-name betas and volatilities. Violet ticks mark the S&P 500 reference."
      />

      {/* Vitals */}
      <Card className="mb-5 px-6 py-6" i={0}>
        <div className="flex flex-wrap items-center justify-around gap-6">
          <Gauge
            value={risk.beta}
            min={0}
            max={2.5}
            marker={{ value: 1, label: "S&P 500 β=1.0" }}
            label="portfolio beta"
            format={(v) => fmtNum(v, 2)}
          />
          <Gauge
            value={risk.volatility}
            min={0}
            max={0.6}
            marker={{ value: SPX.volatility, label: `S&P 500 ${fmtPct(SPX.volatility, 1)}` }}
            label="volatility (ann.)"
            format={(v) => fmtPct(v, 1)}
            color="var(--color-sky)"
          />
          <Gauge
            value={risk.sharpe}
            min={0}
            max={1.2}
            marker={{
              value: (SPX.beta * CMA.equityRiskPremium) / SPX.volatility,
              label: "S&P 500",
            }}
            label="est. sharpe"
            format={(v) => fmtNum(v, 2)}
            color="var(--color-vio)"
          />
          <div className="grid grid-cols-2 gap-x-10 gap-y-5">
            <Stat
              label="Expected return"
              value={risk.expectedReturn}
              format={(v) => fmtPct(v, 1)}
              sub="CAPM, long-run"
            />
            <Stat
              label="Diversification ratio"
              value={risk.diversificationRatio}
              format={(v) => fmtNum(v, 2)}
              sub=">1 = risk canceling"
            />
            <Stat
              label="HHI"
              value={risk.hhi}
              format={(v) => fmtNum(v, 3)}
              sub="concentration index"
            />
            <Stat
              label="Effective names"
              value={risk.effectiveN}
              format={(v) => fmtNum(v, 1)}
              sub={`${portfolio.positions.length} actual`}
            />
          </div>
        </div>
      </Card>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        {/* Concentration */}
        <Card className="px-6 py-5" i={1}>
          <CardHeader
            eyebrow="Position concentration"
            title="Where the book is crowded"
            className="mb-1"
          />
          <div
            className={`mb-4 font-mono text-[11px] ${
              concentrationFlag.tone === "warn" ? "text-warn" : "text-pos"
            }`}
          >
            ▸ {concentrationFlag.text}
          </div>
          <div className="mb-5 grid grid-cols-3 gap-3">
            {(
              [
                ["Top 1", risk.topWeight, 0.2],
                ["Top 3", risk.top3Weight, 0.45],
                ["Top 5", risk.top5Weight, 0.6],
              ] as const
            ).map(([label, v, limit]) => (
              <div key={label} className="rounded-xl border border-edge bg-void/40 px-3 py-2.5">
                <div className="eyebrow">{label}</div>
                <div
                  className={`mt-1 font-mono tnum text-[18px] ${
                    v > limit ? "text-warn" : "text-ink"
                  }`}
                >
                  {fmtPct(v, 1)}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2.5">
            {portfolio.positions.slice(0, 10).map((p, i) => (
              <div key={p.symbol} className="flex items-center gap-3">
                <span className="w-12 shrink-0 font-mono text-[11px] text-mute">
                  {p.symbol}
                </span>
                <div className="flex-1">
                  <Meter
                    value={p.equityWeight}
                    max={Math.max(risk.topWeight * 1.3, 0.25)}
                    delay={0.1 + i * 0.05}
                    color={p.equityWeight > 0.2 ? "var(--color-warn)" : "var(--color-mint)"}
                  />
                </div>
                <span className="w-12 shrink-0 text-right font-mono tnum text-[11px] text-mute">
                  {fmtPct(p.equityWeight, 1)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Risk contribution */}
        <Card className="px-6 py-5" i={2}>
          <CardHeader
            eyebrow="Risk contribution"
            title="What actually drives the volatility"
            className="mb-2"
          />
          <p className="mb-4 text-[12px] leading-relaxed text-mute">
            Marginal contribution to portfolio variance — a 5% weight in a
            high-beta name can carry more risk than a 12% weight in a staple.
          </p>
          <div className="space-y-2.5">
            {risk.contributions.slice(0, 10).map((c, i) => {
              const overweight = c.share > c.weight * 1.5;
              return (
                <div key={c.symbol} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 font-mono text-[11px] text-mute">
                    {c.symbol}
                  </span>
                  <div className="relative flex-1">
                    <Meter
                      value={c.share}
                      max={Math.max(risk.contributions[0]?.share ?? 0.3, 0.3) * 1.15}
                      delay={0.1 + i * 0.05}
                      color={overweight ? "var(--color-neg)" : "var(--color-sky)"}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right font-mono tnum text-[11px]">
                    <span className={overweight ? "text-neg" : "text-ink"}>
                      {fmtPct(c.share, 1)}
                    </span>
                    <span className="text-faint"> / {fmtPct(c.weight, 1)}w</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 font-mono text-[10px] text-faint">
            risk share / portfolio weight — red = pulling more risk than its weight
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Sector allocation */}
        <Card className="px-6 py-5" i={3}>
          <CardHeader
            eyebrow="Sector allocation"
            title="Sector tilts vs S&P 500"
            className="mb-4"
          />
          <div className="space-y-3">
            {risk.sectors.map((s, i) => {
              const delta = s.weight - s.benchmarkWeight;
              return (
                <div key={s.sector}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[12px] text-mute">{s.sector}</span>
                    <span className="font-mono tnum text-[11px]">
                      <span className="text-ink">{fmtPct(s.weight, 1)}</span>
                      <span
                        className={`ml-2 ${
                          Math.abs(delta) < 0.02
                            ? "text-faint"
                            : delta > 0
                              ? "text-mint"
                              : "text-vio"
                        }`}
                      >
                        {delta >= 0 ? "+" : ""}
                        {fmtPct(delta, 1)} vs SPX
                      </span>
                    </span>
                  </div>
                  <Meter
                    value={s.weight}
                    max={Math.max(0.45, risk.sectors[0]?.weight ?? 0.45)}
                    benchmark={s.benchmarkWeight}
                    delay={0.1 + i * 0.04}
                  />
                </div>
              );
            })}
          </div>
        </Card>

        {/* Geography */}
        <Card className="px-6 py-5" i={4}>
          <CardHeader
            eyebrow="Geographic exposure"
            title="Revenue-weighted geography"
            className="mb-2"
          />
          <p className="mb-5 text-[12px] leading-relaxed text-mute">
            Estimated from where each company earns revenue — not listing
            venue. A US-listed mega-cap is rarely a pure-US bet.
          </p>
          <div className="mb-6 flex h-10 w-full overflow-hidden rounded-xl">
            {risk.regions
              .filter((r) => r.weight > 0.001)
              .map((r, i) => (
                <motion.div
                  key={r.region}
                  className="relative h-full"
                  style={{ background: `${REGION_COLORS[r.region]}2e` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${r.weight * 100}%` }}
                  transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{ background: REGION_COLORS[r.region] }}
                  />
                </motion.div>
              ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {risk.regions.map((r) => (
              <div key={r.region} className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: REGION_COLORS[r.region] }}
                />
                <span className="flex-1 text-[12px] text-mute">{r.region}</span>
                <span className="font-mono tnum text-[13px] text-ink">
                  {fmtPct(r.weight, 1)}
                </span>
              </div>
            ))}
          </div>

          {/* Per-holding revenue mix */}
          <div className="mt-5 border-t border-edge pt-4">
            <div className="eyebrow mb-3">Revenue mix by holding</div>
            <div className="space-y-2">
              {portfolio.positions.map((p, i) => {
                const regions = p.fundamentals?.regions ?? { US: 1 };
                const intl = 1 - (regions.US ?? 0);
                return (
                  <motion.div
                    key={p.symbol}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.03 }}
                    className="flex items-center gap-3"
                  >
                    <span className="w-12 shrink-0 font-mono text-[11px] text-mute">
                      {p.symbol}
                    </span>
                    <div className="flex h-[8px] flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                      {(
                        ["US", "Europe", "Asia-Pacific", "Emerging"] as const
                      ).map((region) => {
                        const w = regions[region] ?? 0;
                        if (w <= 0.001) return null;
                        return (
                          <div
                            key={region}
                            className="h-full"
                            style={{
                              width: `${w * 100}%`,
                              background: `color-mix(in srgb, ${REGION_COLORS[region]} 60%, transparent)`,
                            }}
                            title={`${region} ${fmtPct(w, 0)}`}
                          />
                        );
                      })}
                    </div>
                    <span className="w-20 shrink-0 text-right font-mono tnum text-[11px] text-faint">
                      {fmtPct(intl, 0)} intl
                    </span>
                    <span className="w-12 shrink-0 text-right font-mono tnum text-[11px] text-mute">
                      {fmtPct(p.equityWeight, 1)}
                    </span>
                  </motion.div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-end font-mono text-[10px] text-faint">
              intl revenue share · portfolio weight
            </div>
          </div>

          <div className="mt-4 border-t border-edge pt-4 text-[12px] text-mute">
            {risk.regions[0].weight > 0.85
              ? "Heavily US-centric. International diversification is mostly cosmetic here."
              : "Meaningful ex-US revenue exposure — currency and regional cycles will matter."}
          </div>
        </Card>
      </div>
    </div>
  );
}
