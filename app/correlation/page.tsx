"use client";

import { useMemo } from "react";
import { Heatmap } from "@/components/charts/Heatmap";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { correlationMatrix } from "@/lib/analytics/correlation";
import { riskReport } from "@/lib/analytics/risk";
import { SPX } from "@/lib/data/benchmarks";
import { fmtNum } from "@/lib/format";
import { usePortfolio } from "@/lib/store";

export default function CorrelationPage() {
  const { ready, portfolio } = usePortfolio();

  const data = useMemo(() => {
    if (!portfolio) return null;
    return {
      corr: correlationMatrix(portfolio),
      risk: riskReport(portfolio, SPX.sectorWeights),
    };
  }, [portfolio]);

  if (!ready) return null;
  if (!portfolio || !data) return <EmptyState page="The correlation matrix" />;

  const { corr, risk } = data;

  const wAvgRho = corr.weightedAvgCorrelation;
  const verdict =
    wAvgRho > 0.55
      ? "These holdings largely move as one trade. In a drawdown, expect them to fall together."
      : wAvgRho > 0.38
        ? "Moderate co-movement — typical for a growth-tilted equity book."
        : "Genuinely differentiated holdings. The pieces can offset each other.";

  return (
    <div>
      <PageHeader
        eyebrow="Analysis"
        title="Correlation Matrix"
        description="Estimated co-movement between holdings from a market-factor model with sector and industry affinity. Hover any cell for the pair."
      />

      <Card className="mb-5 px-6 py-5" i={0}>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat
            label="Avg pairwise ρ"
            value={wAvgRho}
            format={(v) => fmtNum(v, 2)}
            sub="risk-weighted"
            toneClass={
              wAvgRho > 0.55
                ? "text-warn"
                : wAvgRho > 0.38
                  ? "text-ink"
                  : "text-mint"
            }
          />
          <Stat
            label="Diversification ratio"
            value={risk.diversificationRatio}
            format={(v) => fmtNum(v, 2)}
            sub="risk canceled by mixing"
          />
          {corr.highest && (
            <div>
              <div className="eyebrow">Most coupled</div>
              <div className="mt-1 font-mono text-[15px] text-ink">
                {corr.highest.a} × {corr.highest.b}
              </div>
              <div className="font-mono text-[12px] text-warn">
                ρ {corr.highest.rho.toFixed(2)}
              </div>
            </div>
          )}
          {corr.lowest && (
            <div>
              <div className="eyebrow">Best diversifier pair</div>
              <div className="mt-1 font-mono text-[15px] text-ink">
                {corr.lowest.a} × {corr.lowest.b}
              </div>
              <div className="font-mono text-[12px] text-mint">
                ρ {corr.lowest.rho.toFixed(2)}
              </div>
            </div>
          )}
        </div>
        <p className="mt-4 border-t border-edge pt-3 text-[12.5px] text-mute">
          {verdict}
        </p>
      </Card>

      <Card className="px-6 py-6" i={1}>
        <CardHeader
          eyebrow="Pairwise estimates"
          title="Which holdings move together"
          className="mb-5"
        />
        <ErrorBoundary label="The correlation matrix">
          <Heatmap symbols={corr.symbols} matrix={corr.matrix} />
        </ErrorBoundary>
      </Card>
    </div>
  );
}
