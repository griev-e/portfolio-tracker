"use client";

import { useMemo, useState } from "react";
import { FanChart } from "@/components/charts/FanChart";
import { Histogram } from "@/components/charts/Histogram";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Ring } from "@/components/ui/Ring";
import { Stat } from "@/components/ui/Stat";
import { Computing } from "@/components/ui/Computing";
import { runMonteCarlo } from "@/lib/analytics/montecarlo";
import { riskReport } from "@/lib/analytics/risk";
import { SPX } from "@/lib/data/benchmarks";
import { fmtPct, fmtUSD, fmtUSDCompact } from "@/lib/format";
import { usePortfolio } from "@/lib/store";
import { useAsyncCompute } from "@/lib/useAsyncCompute";

export default function MonteCarloPage() {
  const { ready, portfolio } = usePortfolio();
  const [years, setYears] = useState(10);
  const [contribution, setContribution] = useState(500);
  const [targetMultiple, setTargetMultiple] = useState(4);

  const risk = useMemo(
    () => (portfolio ? riskReport(portfolio, SPX.sectorWeights) : null),
    [portfolio]
  );

  const target = portfolio
    ? Math.round((portfolio.totalValue * targetMultiple) / 1000) * 1000
    : 0;

  const { value: result, pending } = useAsyncCompute(() => {
    if (!portfolio || !risk) return null;
    return runMonteCarlo({
      initialValue: portfolio.totalValue,
      mu: risk.expectedReturn,
      sigma: risk.volatility,
      years,
      monthlyContribution: contribution,
      targetValue: target,
      paths: 3000,
    });
  }, [portfolio, risk, years, contribution, target]);

  if (!ready) return null;
  if (!portfolio || !risk) return <EmptyState page="Monte Carlo simulation" />;

  const prob = result?.probTargetAtHorizon ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Simulation"
        title="Monte Carlo"
        description={`3,000 simulated futures · drift ${fmtPct(risk.expectedReturn, 1)} (CAPM) · volatility ${fmtPct(risk.volatility, 1)} from your actual book. Deterministic per portfolio — not a random slot machine.`}
      />

      {/* Controls */}
      <Card className="mb-5 px-6 py-5" i={0}>
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-3">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="eyebrow">Horizon</span>
              <span className="font-mono tnum text-[15px] text-ink">{years} years</span>
            </div>
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="eyebrow">Monthly contribution</span>
              <span className="font-mono tnum text-[15px] text-ink">
                {fmtUSD(contribution, true)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={5000}
              step={50}
              value={contribution}
              onChange={(e) => setContribution(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="eyebrow">Target</span>
              <span className="font-mono tnum text-[15px] text-warn">
                {fmtUSDCompact(target)}
                <span className="ml-1.5 text-[11px] text-faint">
                  {targetMultiple}× today
                </span>
              </span>
            </div>
            <input
              type="range"
              min={1.5}
              max={20}
              step={0.5}
              value={targetMultiple}
              onChange={(e) => setTargetMultiple(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
      </Card>

      <div className="relative">
        <Computing
          active={pending || !result}
          label="simulating 3,000 paths…"
        />
        {!result ? (
          <div className="panel h-[480px]" />
        ) : (
          <ResultsView result={result} target={target} years={years} prob={prob} />
        )}
      </div>
    </div>
  );
}

function ResultsView({
  result,
  target,
  years,
  prob,
}: {
  result: NonNullable<ReturnType<typeof runMonteCarlo>>;
  target: number;
  years: number;
  prob: number;
}) {
  return (
    <div>
      <div className="mb-5 grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card className="px-6 py-5" i={1}>
          <CardHeader
            eyebrow="Projection fan"
            title="Where 3,000 futures land"
            right={
              <div className="flex items-center gap-3 font-mono text-[10px] text-faint">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-3 rounded-sm bg-mint/30" /> p25–75
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-3 rounded-sm bg-mint/10" /> p5–95
                </span>
              </div>
            }
            className="mb-3"
          />
          <FanChart result={result} target={target} height={380} />
        </Card>

        <div className="space-y-5">
          <Card className="flex flex-col items-center px-6 py-6" i={2}>
            <div className="eyebrow mb-4 self-start">Target probability</div>
            <Ring score={prob * 100} size={150} stroke={10}>
              <div className="font-mono tnum text-[30px] font-medium text-ink">
                {Math.round(prob * 100)}%
              </div>
              <div className="eyebrow !text-[0.5rem]">at horizon</div>
            </Ring>
            <div className="mt-4 w-full space-y-2 border-t border-edge pt-4">
              <div className="flex justify-between text-[12px]">
                <span className="text-mute">Touched at any point</span>
                <span className="font-mono tnum text-ink">
                  {fmtPct(result.probTargetEver, 0)}
                </span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-mute">Target</span>
                <span className="font-mono tnum text-warn">{fmtUSDCompact(target)}</span>
              </div>
            </div>
          </Card>

          <Card className="px-6 py-5" i={3}>
            <div className="eyebrow mb-4">Outcomes at {years}y</div>
            <div className="space-y-4">
              <Stat
                label="Median"
                value={result.median}
                format={fmtUSDCompact}
                sub={`${fmtPct(result.medianCagr, 1)} CAGR on money in`}
              />
              <div className="grid grid-cols-2 gap-4">
                <Stat
                  label="Pessimistic p5"
                  value={result.p5}
                  format={fmtUSDCompact}
                  size="sm"
                  toneClass="text-neg"
                />
                <Stat
                  label="Optimistic p95"
                  value={result.p95}
                  format={fmtUSDCompact}
                  size="sm"
                  toneClass="text-mint"
                />
              </div>
              <Stat
                label="Total contributed"
                value={result.totalContributed}
                format={fmtUSDCompact}
                size="sm"
              />
            </div>
          </Card>
        </div>
      </div>

      <Card className="px-6 py-5" i={4}>
        <CardHeader
          eyebrow="Terminal distribution"
          title={`Spread of outcomes at year ${years}`}
          right={
            <span className="font-mono text-[10px] text-faint">
              mint = above target
            </span>
          }
          className="mb-4"
        />
        <Histogram bins={result.histogram} target={target} height={150} />
        <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
          Geometric Brownian motion, monthly steps, contributions added end of
          month. Drift uses CAPM on your portfolio beta; volatility comes from
          the estimated covariance of your actual holdings. Real markets have
          fatter tails than GBM — treat the p5 line as optimistic about how bad
          bad can get.
        </p>
      </Card>
    </div>
  );
}
