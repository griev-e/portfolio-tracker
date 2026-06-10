"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { PALETTE } from "@/components/charts/Donut";
import { Radar } from "@/components/charts/Radar";
import { Scatter, type ScatterPoint } from "@/components/charts/Scatter";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { portfolioFactors } from "@/lib/analytics/factors";
import { qualityReport } from "@/lib/analytics/quality";
import { riskReport } from "@/lib/analytics/risk";
import { NDX, SPX } from "@/lib/data/benchmarks";
import { fmtMultiple, fmtNum, fmtPct } from "@/lib/format";
import { usePortfolio } from "@/lib/store";

export default function BenchmarkPage() {
  const { ready, portfolio } = usePortfolio();

  const data = useMemo(() => {
    if (!portfolio) return null;
    const quality = qualityReport(portfolio);
    const risk = riskReport(portfolio, SPX.sectorWeights);
    const factors = portfolioFactors(portfolio);
    const get = (key: string) =>
      quality.metrics.find((m) => m.key === key)?.value ?? NaN;
    return { quality, risk, factors, get };
  }, [portfolio]);

  if (!ready) return null;
  if (!portfolio || !data) return <EmptyState page="Benchmark comparison" />;

  const { risk, factors, get } = data;

  const rows: {
    label: string;
    you: number;
    spx: number;
    ndx: number;
    format: (v: number) => string;
    lowerIsBetter?: boolean;
  }[] = [
    { label: "Revenue growth", you: get("revenueGrowth"), spx: SPX.revenueGrowth, ndx: NDX.revenueGrowth, format: (v) => fmtPct(v, 1) },
    { label: "EPS growth", you: get("epsGrowth"), spx: SPX.epsGrowth, ndx: NDX.epsGrowth, format: (v) => fmtPct(v, 1) },
    { label: "FCF growth", you: get("fcfGrowth"), spx: SPX.fcfGrowth, ndx: NDX.fcfGrowth, format: (v) => fmtPct(v, 1) },
    { label: "ROIC", you: get("roic"), spx: SPX.roic, ndx: NDX.roic, format: (v) => fmtPct(v, 1) },
    { label: "Operating margin", you: get("operatingMargin"), spx: SPX.operatingMargin, ndx: NDX.operatingMargin, format: (v) => fmtPct(v, 1) },
    { label: "Forward P/E", you: get("forwardPE"), spx: SPX.forwardPE, ndx: NDX.forwardPE, format: (v) => fmtMultiple(v), lowerIsBetter: true },
    { label: "FCF yield", you: get("fcfYield"), spx: SPX.fcfYield, ndx: NDX.fcfYield, format: (v) => fmtPct(v, 1) },
    { label: "Dividend yield", you: get("dividendYield"), spx: SPX.dividendYield, ndx: NDX.dividendYield, format: (v) => fmtPct(v, 2) },
    { label: "Volatility (est.)", you: risk.volatility, spx: SPX.volatility, ndx: NDX.volatility, format: (v) => fmtPct(v, 1), lowerIsBetter: true },
    { label: "Beta", you: risk.beta, spx: SPX.beta, ndx: NDX.beta, format: (v) => fmtNum(v, 2) },
  ];

  const scatterPoints: ScatterPoint[] = [
    ...portfolio.positions
      .filter((p) => p.fundamentals?.forwardPE)
      .map((p, i) => ({
        id: p.symbol,
        label: p.symbol,
        x: p.fundamentals!.revenueGrowth,
        y: p.fundamentals!.forwardPE!,
        size: p.equityWeight,
        color: PALETTE[i % PALETTE.length],
      })),
    { id: "SPX", label: "S&P 500", x: SPX.revenueGrowth, y: SPX.forwardPE, size: 0, isBenchmark: true },
    { id: "NDX", label: "NDX-100", x: NDX.revenueGrowth, y: NDX.forwardPE, size: 0, isBenchmark: true },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Analysis"
        title="Benchmark & Factor Exposure"
        description="Your weighted fundamentals against the S&P 500 and NASDAQ-100, plus the style-factor footprint of the whole book."
      />

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        {/* Comparison table */}
        <Card className="px-6 py-5" i={0}>
          <CardHeader
            eyebrow="Head to head"
            title="Portfolio vs index aggregates"
            className="mb-5"
          />
          <div className="space-y-1">
            <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 border-b border-edge pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              <span>Metric</span>
              <span className="text-right text-mint">You</span>
              <span className="text-right text-vio">S&P 500</span>
              <span className="text-right text-sky">NASDAQ-100</span>
            </div>
            {rows.map((r, i) => {
              const beatsSpx = r.lowerIsBetter ? r.you < r.spx : r.you > r.spx;
              const beatsNdx = r.lowerIsBetter ? r.you < r.ndx : r.you > r.ndx;
              return (
                <motion.div
                  key={r.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="grid grid-cols-[1.4fr_1fr_1fr_1fr] items-baseline gap-2 rounded-lg px-1 py-2 hover:bg-white/[0.02]"
                >
                  <span className="text-[12.5px] text-mute">{r.label}</span>
                  <span className="text-right font-mono tnum text-[13.5px] font-medium text-ink">
                    {Number.isFinite(r.you) ? r.format(r.you) : "n/m"}
                  </span>
                  <span className={`text-right font-mono tnum text-[12.5px] ${beatsSpx ? "text-faint" : "text-vio"}`}>
                    {r.format(r.spx)}
                    <span className="ml-1 text-[10px]">{beatsSpx ? "✓" : ""}</span>
                  </span>
                  <span className={`text-right font-mono tnum text-[12.5px] ${beatsNdx ? "text-faint" : "text-sky"}`}>
                    {r.format(r.ndx)}
                    <span className="ml-1 text-[10px]">{beatsNdx ? "✓" : ""}</span>
                  </span>
                </motion.div>
              );
            })}
          </div>
          <div className="mt-3 font-mono text-[10px] text-faint">
            ✓ = your portfolio screens better on that metric
          </div>
        </Card>

        {/* Factor radar */}
        <Card className="flex flex-col items-center justify-center px-6 py-5" i={1}>
          <CardHeader
            eyebrow="Factor exposure"
            title="Style footprint"
            className="mb-2 self-start"
          />
          <Radar
            axes={["Growth", "Value", "Quality", "Momentum"]}
            series={[
              {
                id: "you",
                label: "Your portfolio",
                color: "#5EEAD4",
                values: [factors.growth, factors.value, factors.quality, factors.momentum],
                fillOpacity: 0.16,
              },
              {
                id: "spx",
                label: "S&P 500",
                color: "#A78BFA",
                values: [SPX.factorScores.growth, SPX.factorScores.value, SPX.factorScores.quality, SPX.factorScores.momentum],
                fillOpacity: 0.07,
              },
              {
                id: "ndx",
                label: "NASDAQ-100",
                color: "#7DD3FC",
                values: [NDX.factorScores.growth, NDX.factorScores.value, NDX.factorScores.quality, NDX.factorScores.momentum],
                fillOpacity: 0.05,
              },
            ]}
            size={310}
          />
          <div className="mt-3 grid w-full grid-cols-4 gap-2 border-t border-edge pt-4">
            {(
              [
                ["Growth", factors.growth],
                ["Value", factors.value],
                ["Quality", factors.quality],
                ["Momentum", factors.momentum],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="text-center">
                <div className="eyebrow !text-[0.55rem]">{label}</div>
                <div
                  className={`mt-0.5 font-mono tnum text-[16px] ${
                    v >= 60 ? "text-mint" : v <= 40 ? "text-neg" : "text-ink"
                  }`}
                >
                  {Math.round(v)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Growth vs valuation map */}
      <Card className="px-6 py-5" i={2}>
        <CardHeader
          eyebrow="Positioning map"
          title="What you pay vs what you get"
          right={
            <span className="font-mono text-[10px] text-faint">
              bubble = position size · ◆ = index
            </span>
          }
          className="mb-3"
        />
        <Scatter
          points={scatterPoints}
          xLabel="revenue growth"
          yLabel="forward p/e"
          xFormat={(v) => fmtPct(v, 1)}
          yFormat={(v) => fmtMultiple(v)}
          height={400}
        />
        <p className="mt-2 text-[12px] leading-relaxed text-mute">
          Top-left is expensive-and-slow, bottom-right is cheap-and-fast. Names
          far above the diagonal of the two index markers need their growth to
          show up — or the multiple does the falling.
        </p>
      </Card>
    </div>
  );
}
