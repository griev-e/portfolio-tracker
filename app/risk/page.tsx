"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Gauge } from "@/components/ui/Gauge";
import { Meter } from "@/components/ui/Meter";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { riskReport } from "@/lib/analytics/risk";
import { SPX } from "@/lib/data/benchmarks";
import { getCMA, liveBenchmarkVolatility, liveBenchmarkProfiles } from "@/lib/live/cma";
import { DEFAULT_BETA, estimatedVolatility } from "@/lib/live/merge";
import { useAssumptions } from "@/lib/assumptions/store";
import { fmtNum, fmtPct } from "@/lib/format";
import { usePortfolio } from "@/lib/store";

export default function RiskPage() {
  const { ready, portfolio } = usePortfolio();
  const { version } = useAssumptions();
  const CMA = getCMA();
  const spxVol = liveBenchmarkVolatility(SPX);
  const risk = useMemo(
    () =>
      portfolio
        ? riskReport(portfolio, liveBenchmarkProfiles().spx.sectorWeights)
        : null,
    // version: recompute on assumption edits (read via the analytics singleton).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, version]
  );

  if (!ready) return null;
  if (!portfolio || !risk) return <EmptyState page="Risk analysis" />;

  const concentrationFlag =
    risk.topWeight > 0.2
      ? { text: "Single-name concentration is elevated", tone: "warn" }
      : risk.effectiveN < 8
        ? { text: "Diversification is thinner than it looks", tone: "warn" }
        : { text: "Concentration profile looks healthy", tone: "ok" };

  // Holdings with no live fundamentals are excluded from the factor math.
  const noData = portfolio.positions.filter((p) => !p.fundamentals);


  return (
    <div>
      <PageHeader
        eyebrow="Portfolio"
        title="Risk Analysis"
        description="Estimated from position weights, factor-model correlations, and live per-name betas and volatilities. Violet ticks mark the S&P 500 reference."
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
            tip="Beta measures how much the portfolio moves relative to the broad market (the S&P 500, which is defined as β = 1.0). A beta of 1.25 means it tends to rise and fall about 25% more than the market; below 1.0 means it's less reactive. It captures market-driven risk, not company-specific risk."
          />
          <Gauge
            value={risk.volatility}
            min={0}
            max={0.6}
            marker={{ value: spxVol, label: `S&P 500 ${fmtPct(spxVol, 1)}` }}
            label="volatility (ann.)"
            format={(v) => fmtPct(v, 1)}
            color="var(--color-sky)"
            tip="Volatility is the annualized standard deviation of returns — how widely the portfolio's value swings over a year. A higher figure means larger ups and downs in both directions. This estimate blends each holding's own volatility with how the holdings move together."
          />
          <Gauge
            value={risk.sharpe}
            min={0}
            max={1.2}
            marker={{
              value: (SPX.beta * CMA.equityRiskPremium) / spxVol,
              label: "S&P 500",
            }}
            label="est. sharpe"
            format={(v) => fmtNum(v, 2)}
            color="var(--color-vio)"
            tip={`The Sharpe ratio is return earned per unit of risk taken — expected return above the risk-free rate, divided by volatility. Higher is better: it tells you whether the portfolio's returns justify its swings. Around 1.0 is generally considered solid for an equity book. Because it inherits the CAPM expected return, it spans roughly ${fmtNum(
              risk.sharpeBand.low,
              2
            )}–${fmtNum(risk.sharpeBand.high, 2)} across a plausible 3–6% equity risk premium — treat it as a band, not a precise figure.`}
          />
          <div className="grid grid-cols-2 gap-x-10 gap-y-5">
            <Stat
              label="Expected return"
              value={risk.expectedReturn}
              format={(v) => fmtPct(v, 1)}
              sub={`${fmtPct(risk.expectedReturnBand.low, 1)}–${fmtPct(
                risk.expectedReturnBand.high,
                1
              )} across ERP ${fmtPct(risk.erpRange.low, 0)}–${fmtPct(
                risk.erpRange.high,
                0
              )}`}
              tip="A long-run annual return estimate from the Capital Asset Pricing Model (CAPM): the risk-free rate plus the portfolio's beta times the market's equity risk premium. The risk-free rate (13-week T-bill) and market volatility are fetched live; the equity risk premium is a fixed forward-looking assumption — it has no observable market quote and is editable on the Benchmark page. The range shows how the estimate moves across a plausible 3–6% ERP, so read the headline as the midpoint of a band, not a forecast of any given year."
            />
            <Stat
              label="Diversification ratio"
              value={risk.diversificationRatio}
              format={(v) => fmtNum(v, 2)}
              sub=">1 = risk canceling"
              tip="The diversification ratio compares the weighted-average volatility of the individual holdings to the portfolio's actual volatility. A value above 1 means the holdings partly cancel each other out — the higher it is, the more risk reduction you're getting from combining names rather than holding them alone."
            />
            <Stat
              label="HHI"
              value={risk.hhi}
              format={(v) => fmtNum(v, 3)}
              sub="concentration index"
              tip="The Herfindahl-Hirschman Index is the sum of each position's squared weight — a concentration gauge. It runs from near 0 (many tiny, evenly-sized positions) to 1 (everything in a single name). The lower the number, the more spread out the portfolio is."
            />
            <Stat
              label="Effective names"
              value={risk.effectiveN}
              format={(v) => fmtNum(v, 1)}
              sub={`${portfolio.positions.length} actual`}
              tip="The number of equally-weighted positions the portfolio behaves like (1 ÷ HHI). If a few holdings dominate, the effective count falls well below the actual headcount — a quick reality check on how diversified the book truly is versus how many tickers it holds."
            />
          </div>
        </div>
      </Card>

      {/* Coverage banner — only when a holding actually lacks live fundamentals.
          risk.coveragePct is weighted against the *whole* book (cash included,
          matching how beta/volatility apply their cash drag), so cash alone can
          push it below 100% with zero real gaps — gate on the actual no-data
          list, not the percentage, so the banner never claims an exclusion that
          didn't happen. */}
      {noData.length > 0 && (
        <Card className="mb-5 px-6 py-4" i={0}>
          <div className="flex items-start gap-3">
            <span className="mt-[5px] inline-block h-[7px] w-[7px] shrink-0 rounded-full border border-warn/70" />
            <div>
              <div className="font-mono text-[12px] text-warn">
                Risk analytics cover {fmtPct(risk.coveragePct, 0)} of the book by
                weight
              </div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-mute">
                {noData.length} holding{noData.length === 1 ? "" : "s"} with no
                live fundamentals{" "}
                <span className="font-mono text-faint">
                  ({noData.map((p) => p.symbol).join(", ")})
                </span>{" "}
                {noData.length === 1 ? "is" : "are"} excluded from the beta,
                volatility, correlation and factor math — never silently
                folded in. Allocation, weights and P&amp;L still include them.
              </div>
              <div className="mt-1.5 text-[11.5px] leading-relaxed text-faint">
                If you did want a placeholder for these, the model&apos;s
                neutral estimate (no information to differentiate names) would
                be β{" "}
                {DEFAULT_BETA.toFixed(1)} and{" "}
                {fmtPct(estimatedVolatility(DEFAULT_BETA), 0)} volatility —
                shown for reference only; it is not used in any calculation
                above.
              </div>
            </div>
          </div>
        </Card>
      )}

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

      </div>
    </div>
  );
}
