"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { correlationMatrix } from "@/lib/analytics/correlation";
import { dividendReport } from "@/lib/analytics/dividends/engine";
import type {
  DividendProfile,
  DividendReport,
} from "@/lib/analytics/dividends/types";
import { portfolioFactors } from "@/lib/analytics/factors";
import { qualityReport, type MetricFormat } from "@/lib/analytics/quality";
import type { RegimeReport } from "@/lib/analytics/regime/types";
import { riskReport } from "@/lib/analytics/risk";
import { liveBenchmarkProfiles } from "@/lib/live/cma";
import { useAssumptions } from "@/lib/assumptions/store";
import type { BenchmarkProfile } from "@/lib/types";
import {
  daysUntil,
  fmtMultiple,
  fmtNum,
  fmtPct,
  fmtShares,
  fmtUSD,
  fmtUSDCompact,
} from "@/lib/format";
import { usePortfolio, useLiveStatus } from "@/lib/store";
import type { Portfolio } from "@/lib/types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** NASDAQ-100 reference keyed by the quality scorecard's metric keys. */
function ndxByKey(ndx: BenchmarkProfile): Record<string, number | null> {
  return {
    revenueGrowth: ndx.revenueGrowth,
    epsGrowth: ndx.epsGrowth,
    fcfGrowth: ndx.fcfGrowth,
    roic: ndx.roic,
    operatingMargin: ndx.operatingMargin,
    grossMargin: ndx.grossMargin,
    forwardPE: ndx.forwardPE,
    peg: ndx.forwardPE / (ndx.epsGrowth * 100),
    fcfYield: ndx.fcfYield,
    dividendYield: ndx.dividendYield,
  };
}

function fmtMetric(value: number | null, format: MetricFormat): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (format === "pct") return fmtPct(value, 1);
  if (format === "multiple") return fmtMultiple(value);
  return value.toFixed(2);
}

/** Signed dollar/percent cell with pos/neg coloring. */
function Signed({
  value,
  pct = false,
  compact = false,
}: {
  value: number | null;
  pct?: boolean;
  compact?: boolean;
}) {
  if (value === null || !Number.isFinite(value)) return <>—</>;
  const cls = value > 0 ? "pos" : value < 0 ? "neg" : undefined;
  const text = pct
    ? fmtPct(value, 1, true)
    : (value >= 0 ? "+" : "") + (compact ? fmtUSDCompact(value) : fmtUSD(value));
  return <span className={cls}>{text}</span>;
}

/* ── async overlays (market regime + dividend profiles) ─────────────────── */

interface Overlays {
  market: RegimeReport | null;
  marketError: boolean;
  dividends: DividendReport | null;
  dividendError: boolean;
  loading: boolean;
}

function useReportOverlays(portfolio: Portfolio | null): Overlays {
  const [market, setMarket] = useState<RegimeReport | null>(null);
  const [marketError, setMarketError] = useState(false);
  const [profiles, setProfiles] = useState<Record<
    string,
    DividendProfile | null
  > | null>(null);
  const [dividendError, setDividendError] = useState(false);
  const [loading, setLoading] = useState(true);

  const symbolKey = portfolio
    ? portfolio.positions.map((p) => p.symbol).join(",")
    : "";

  const load = useCallback(async () => {
    if (!symbolKey) return;
    setLoading(true);
    const onUnauthorized = () => window.location.replace("/lock");

    const marketReq = fetch("/api/market")
      .then((res) => {
        if (res.status === 401) return onUnauthorized();
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json().then((j) => setMarket(j as RegimeReport));
      })
      .catch(() => setMarketError(true));

    const divReq = fetch(`/api/dividends?symbols=${symbolKey}`)
      .then((res) => {
        if (res.status === 401) return onUnauthorized();
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res
          .json()
          .then((j: { profiles: Record<string, DividendProfile | null> }) =>
            setProfiles(j.profiles)
          );
      })
      .catch(() => setDividendError(true));

    await Promise.all([marketReq, divReq]);
    setLoading(false);
  }, [symbolKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const dividends = useMemo(
    () => (portfolio && profiles ? dividendReport(portfolio, profiles) : null),
    [portfolio, profiles]
  );

  return { market, marketError, dividends, dividendError, loading };
}

/* ── page ───────────────────────────────────────────────────────────────── */

export default function ReportPage() {
  const { ready, portfolio, isDemo } = usePortfolio();
  const { version } = useAssumptions();
  const live = useLiveStatus();
  const overlays = useReportOverlays(portfolio);
  const { spx, ndx } = liveBenchmarkProfiles();

  const analytics = useMemo(() => {
    if (!portfolio) return null;
    return {
      risk: riskReport(portfolio, liveBenchmarkProfiles().spx.sectorWeights),
      quality: qualityReport(portfolio),
      factors: portfolioFactors(portfolio),
      corr: correlationMatrix(portfolio),
    };
    // version: recompute on assumption edits (read via the analytics singleton).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, version]);

  if (!ready) {
    return (
      <div className="report-shell">
        <p className="muted mx-auto max-w-[940px] text-[13px] text-mute">
          Loading portfolio…
        </p>
      </div>
    );
  }

  if (!portfolio || !analytics) {
    return (
      <div className="report-shell">
        <div className="mx-auto max-w-[940px] text-center text-mute">
          <p className="mb-4 text-[14px]">No portfolio to export yet.</p>
          <Link href="/import" className="btn-primary no-print">
            Import holdings
          </Link>
        </div>
      </div>
    );
  }

  const { risk, quality, factors, corr } = analytics;
  const positions = [...portfolio.positions].sort((a, b) => b.equity - a.equity);
  const generatedAt = new Date();

  const earnings = portfolio.positions
    .map((p) => ({ p, d: daysUntil(p.fundamentals?.earningsDate ?? null) }))
    .filter((x) => x.d !== null && x.d >= 0)
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0));

  const dataStatus = live.degraded
    ? `Imported prices (live feed offline) · ${live.livePriceCount} live`
    : `Live prices · ${live.livePriceCount} of ${portfolio.positions.length} repriced`;

  return (
    <div className="report-shell">
      {/* Toolbar — never printed */}
      <div className="report-bar no-print">
        <Link href="/" className="btn-secondary">
          ← Back
        </Link>
        <div className="text-[13px] text-mute">
          {overlays.loading
            ? "Loading market & dividend data…"
            : "Report ready"}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-primary ml-auto"
          disabled={overlays.loading}
        >
          Export PDF
        </button>
      </div>

      <article className="report-doc">
        {/* Header */}
        <header className="avoid-break">
          <h1>alpha — Portfolio Report</h1>
          <p className="muted">
            Generated {generatedAt.toLocaleString("en-US")} · Holdings as of{" "}
            {new Date(portfolio.asOf).toLocaleDateString("en-US")}
            {isDemo ? " · Demo portfolio" : ""}
          </p>
          <p className="muted">{dataStatus}</p>
          <p className="muted" style={{ marginTop: 8, fontSize: 11 }}>
            All analytics are model-based estimates, not investment advice. AI
            commentary (daily brief, allocator), Scenarios, Monte Carlo, and
            patch notes are intentionally excluded — this document is the raw
            analytical record, intended for downstream AI analysis.
          </p>
        </header>

        {/* 1 · Summary */}
        <section className="report-section">
          <h2>Portfolio Summary</h2>
          <div className="kpis avoid-break">
            <div className="kpi">
              <div className="label">Total Value</div>
              <div className="value">{fmtUSD(portfolio.totalValue, true)}</div>
            </div>
            <div className="kpi">
              <div className="label">Total Return</div>
              <div className="value">
                <Signed value={portfolio.totalReturn} compact />{" "}
                <span style={{ fontSize: 12, fontWeight: 400 }}>
                  (<Signed value={portfolio.totalReturnPct} pct />)
                </span>
              </div>
            </div>
            <div className="kpi">
              <div className="label">Day Change</div>
              <div className="value">
                <Signed value={portfolio.dayChange} compact />{" "}
                <span style={{ fontSize: 12, fontWeight: 400 }}>
                  (<Signed value={portfolio.dayChangePct} pct />)
                </span>
              </div>
            </div>
            <div className="kpi">
              <div className="label">Positions</div>
              <div className="value">{portfolio.positions.length}</div>
            </div>
            <div className="kpi">
              <div className="label">Equity Value</div>
              <div className="value">{fmtUSD(portfolio.equityValue, true)}</div>
            </div>
            <div className="kpi">
              <div className="label">Cash</div>
              <div className="value">
                {fmtUSD(portfolio.cash, true)}{" "}
                <span style={{ fontSize: 12, fontWeight: 400 }}>
                  ({fmtPct(portfolio.cashWeight, 1)})
                </span>
              </div>
            </div>
            <div className="kpi">
              <div className="label">Cost Basis</div>
              <div className="value">{fmtUSD(portfolio.totalCostBasis, true)}</div>
            </div>
            <div className="kpi">
              <div className="label">Effective Holdings (N)</div>
              <div className="value">{fmtNum(risk.effectiveN, 1)}</div>
            </div>
          </div>
        </section>

        {/* 2 · Holdings */}
        <section className="report-section">
          <h2>Holdings</h2>
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Sector</th>
                <th>Shares</th>
                <th>Price</th>
                <th>Avg Cost</th>
                <th>Equity</th>
                <th>Weight</th>
                <th>Cost Basis</th>
                <th>Unreal. P&amp;L</th>
                <th>Return</th>
                <th>Day</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const dayPct =
                  p.prevClose && p.prevClose > 0
                    ? p.price / p.prevClose - 1
                    : null;
                return (
                  <tr key={p.symbol}>
                    <td>{p.symbol}</td>
                    <td className="wrap">{p.name}</td>
                    <td>{p.fundamentals?.sector ?? "—"}</td>
                    <td>{fmtShares(p.shares)}</td>
                    <td>{fmtUSD(p.price)}</td>
                    <td>{fmtUSD(p.averageCost)}</td>
                    <td>{fmtUSD(p.equity, true)}</td>
                    <td>{fmtPct(p.weight, 1)}</td>
                    <td>{fmtUSD(p.costBasis, true)}</td>
                    <td>
                      <Signed value={p.totalReturn} compact />
                    </td>
                    <td>
                      <Signed value={p.returnPct} pct />
                    </td>
                    <td>
                      <Signed value={dayPct} pct />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* 3 · Risk */}
        <section className="report-section">
          <h2>Risk &amp; Concentration</h2>
          <div className="kpis avoid-break">
            <div className="kpi">
              <div className="label">Beta (vs S&amp;P 500)</div>
              <div className="value">{fmtNum(risk.beta, 2)}</div>
            </div>
            <div className="kpi">
              <div className="label">Volatility (ann.)</div>
              <div className="value">{fmtPct(risk.volatility, 1)}</div>
            </div>
            <div className="kpi">
              <div className="label">Expected Return (CAPM)</div>
              <div className="value">{fmtPct(risk.expectedReturn, 1)}</div>
            </div>
            <div className="kpi">
              <div className="label">Sharpe</div>
              <div className="value">{fmtNum(risk.sharpe, 2)}</div>
            </div>
            <div className="kpi">
              <div className="label">Top Holding</div>
              <div className="value">{fmtPct(risk.topWeight, 1)}</div>
            </div>
            <div className="kpi">
              <div className="label">Top 3 / Top 5</div>
              <div className="value">
                {fmtPct(risk.top3Weight, 0)} / {fmtPct(risk.top5Weight, 0)}
              </div>
            </div>
            <div className="kpi">
              <div className="label">Diversification Ratio</div>
              <div className="value">{fmtNum(risk.diversificationRatio, 2)}</div>
            </div>
            <div className="kpi">
              <div className="label">Fundamentals Coverage</div>
              <div className="value">{fmtPct(risk.coveragePct, 0)}</div>
            </div>
          </div>

          <h3>Sector Exposure vs S&amp;P 500</h3>
          <table>
            <thead>
              <tr>
                <th>Sector</th>
                <th>Portfolio</th>
                <th>S&amp;P 500</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {risk.sectors.map((s) => (
                <tr key={s.sector}>
                  <td>{s.sector}</td>
                  <td>{fmtPct(s.weight, 1)}</td>
                  <td>{fmtPct(s.benchmarkWeight, 1)}</td>
                  <td>
                    <Signed value={s.weight - s.benchmarkWeight} pct />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Geographic Exposure (revenue-weighted)</h3>
          {risk.regions.reduce((s, r) => s + r.weight, 0) < 0.001 ? (
            <p className="muted">
              Region data unavailable — no live revenue-by-region source is
              configured.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Weight</th>
                </tr>
              </thead>
              <tbody>
                {risk.regions.map((r) => (
                  <tr key={r.region}>
                    <td>{r.region}</td>
                    <td>{fmtPct(r.weight, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Risk Contribution (share of portfolio variance)</h3>
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Weight</th>
                <th>Variance Share</th>
                <th>Standalone (wσ)</th>
              </tr>
            </thead>
            <tbody>
              {risk.contributions.slice(0, 15).map((c) => (
                <tr key={c.symbol}>
                  <td>{c.symbol}</td>
                  <td>{fmtPct(c.weight, 1)}</td>
                  <td>{fmtPct(c.share, 1)}</td>
                  <td>{fmtPct(c.standalone, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 4 · Quality */}
        <section className="report-section">
          <h2>Quality Scorecard</h2>
          <div className="kpis avoid-break">
            <div className="kpi">
              <div className="label">Composite</div>
              <div className="value">
                {quality.composite} · {quality.compositeGrade}
              </div>
            </div>
            {quality.categories.map((c) => (
              <div className="kpi" key={c.id}>
                <div className="label">{c.label}</div>
                <div className="value">
                  {c.score} · {c.grade}
                </div>
              </div>
            ))}
          </div>

          <h3>Metrics vs S&amp;P 500</h3>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Portfolio</th>
                <th>S&amp;P 500</th>
                <th>Score</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {quality.metrics.map((m) => (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  <td>{fmtMetric(m.value, m.format)}</td>
                  <td>{fmtMetric(m.benchmark, m.format)}</td>
                  <td>{m.score}</td>
                  <td>{m.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Per-Holding Quality</h3>
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Weight</th>
                <th>Score</th>
                <th>Grade</th>
                <th>Growth</th>
                <th>Profit.</th>
                <th>Valuation</th>
                <th>Income</th>
              </tr>
            </thead>
            <tbody>
              {quality.holdings.map((h) => (
                <tr key={h.symbol}>
                  <td>{h.symbol}</td>
                  <td>{fmtPct(h.weight, 1)}</td>
                  <td>{h.score}</td>
                  <td>{h.grade}</td>
                  <td>{h.categories.growth}</td>
                  <td>{h.categories.profitability}</td>
                  <td>{h.categories.valuation}</td>
                  <td>{h.categories.income}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 5 · Benchmark & Factors */}
        <section className="report-section">
          <h2>Benchmark &amp; Factors</h2>
          <h3>Portfolio vs Indices</h3>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Portfolio</th>
                <th>S&amp;P 500</th>
                <th>NASDAQ-100</th>
              </tr>
            </thead>
            <tbody>
              {quality.metrics.map((m) => (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  <td>{fmtMetric(m.value, m.format)}</td>
                  <td>{fmtMetric(m.benchmark, m.format)}</td>
                  <td>{fmtMetric(ndxByKey(ndx)[m.key] ?? null, m.format)}</td>
                </tr>
              ))}
              <tr>
                <td>Volatility (ann.)</td>
                <td>{fmtPct(risk.volatility, 1)}</td>
                <td>{fmtPct(spx.volatility, 1)}</td>
                <td>{fmtPct(ndx.volatility, 1)}</td>
              </tr>
              <tr>
                <td>Beta</td>
                <td>{fmtNum(risk.beta, 2)}</td>
                <td>{fmtNum(spx.beta, 2)}</td>
                <td>{fmtNum(ndx.beta, 2)}</td>
              </tr>
            </tbody>
          </table>

          <h3>Factor Tilts (0–100, coverage {fmtPct(factors.coveragePct, 0)})</h3>
          <table>
            <thead>
              <tr>
                <th>Factor</th>
                <th>Portfolio</th>
                <th>S&amp;P 500</th>
                <th>NASDAQ-100</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Growth</td>
                <td>{fmtNum(factors.growth, 0)}</td>
                <td>{spx.factorScores.growth}</td>
                <td>{ndx.factorScores.growth}</td>
              </tr>
              <tr>
                <td>Value</td>
                <td>{fmtNum(factors.value, 0)}</td>
                <td>{spx.factorScores.value}</td>
                <td>{ndx.factorScores.value}</td>
              </tr>
              <tr>
                <td>Quality</td>
                <td>{fmtNum(factors.quality, 0)}</td>
                <td>{spx.factorScores.quality}</td>
                <td>{ndx.factorScores.quality}</td>
              </tr>
              <tr>
                <td>Momentum</td>
                <td>{fmtNum(factors.momentum, 0)}</td>
                <td>{spx.factorScores.momentum}</td>
                <td>{ndx.factorScores.momentum}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 6 · Holdings fundamentals (Research drill-down) */}
        <section className="report-section">
          <h2>Holdings Fundamentals</h2>
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Fwd P/E</th>
                <th>Rev Gr</th>
                <th>EPS Gr</th>
                <th>ROIC</th>
                <th>Op Mgn</th>
                <th>FCF Yld</th>
                <th>Div Yld</th>
                <th>Beta</th>
                <th>Rating</th>
                <th>Target</th>
                <th>Upside</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const f = p.fundamentals;
                const upside =
                  f && p.price > 0 ? f.analyst.priceTarget / p.price - 1 : null;
                return (
                  <tr key={p.symbol}>
                    <td>{p.symbol}</td>
                    <td>{f ? fmtMultiple(f.forwardPE) : "—"}</td>
                    <td>{f ? fmtPct(f.revenueGrowth, 1) : "—"}</td>
                    <td>{f ? fmtPct(f.epsGrowth, 1) : "—"}</td>
                    <td>{f ? fmtPct(f.roic, 1) : "—"}</td>
                    <td>{f ? fmtPct(f.operatingMargin, 1) : "—"}</td>
                    <td>{f ? fmtPct(f.fcfYield, 1) : "—"}</td>
                    <td>{f ? fmtPct(f.dividendYield, 1) : "—"}</td>
                    <td>{f ? fmtNum(f.beta, 2) : "—"}</td>
                    <td>{f ? f.analyst.rating : "—"}</td>
                    <td>{f ? fmtUSD(f.analyst.priceTarget) : "—"}</td>
                    <td>
                      <Signed value={upside} pct />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* 7 · Correlation */}
        <section className="report-section">
          <h2>Correlation &amp; Diversification</h2>
          <div className="kpis avoid-break">
            <div className="kpi">
              <div className="label">Avg Pairwise Correlation</div>
              <div className="value">{fmtNum(corr.weightedAvgCorrelation, 2)}</div>
            </div>
            <div className="kpi">
              <div className="label">Diversification Ratio</div>
              <div className="value">{fmtNum(risk.diversificationRatio, 2)}</div>
            </div>
            <div className="kpi">
              <div className="label">Most Correlated</div>
              <div className="value" style={{ fontSize: 13 }}>
                {corr.highest
                  ? `${corr.highest.a}·${corr.highest.b} ${fmtNum(corr.highest.rho, 2)}`
                  : "—"}
              </div>
            </div>
            <div className="kpi">
              <div className="label">Best Diversifier</div>
              <div className="value" style={{ fontSize: 13 }}>
                {corr.lowest
                  ? `${corr.lowest.a}·${corr.lowest.b} ${fmtNum(corr.lowest.rho, 2)}`
                  : "—"}
              </div>
            </div>
          </div>

          {corr.symbols.length <= 24 && (
            <>
              <h3>Correlation Matrix</h3>
              <table style={{ fontSize: 9 }}>
                <thead>
                  <tr>
                    <th></th>
                    {corr.symbols.map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corr.matrix.map((row, i) => (
                    <tr key={corr.symbols[i]}>
                      <td>{corr.symbols[i]}</td>
                      {row.map((rho, j) => (
                        <td key={corr.symbols[j]}>{rho.toFixed(2)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        {/* 8 · Dividends */}
        <section className="report-section">
          <h2>Dividend Income</h2>
          <DividendBlock
            report={overlays.dividends}
            error={overlays.dividendError}
            loading={overlays.loading}
          />
        </section>

        {/* 9 · Market regime */}
        <section className="report-section">
          <h2>Market Regime</h2>
          <MarketBlock
            report={overlays.market}
            error={overlays.marketError}
            loading={overlays.loading}
          />
        </section>

        {/* 10 · Earnings calendar (Intelligence) */}
        <section className="report-section">
          <h2>Upcoming Earnings</h2>
          {earnings.length === 0 ? (
            <p className="note">No upcoming earnings dates in coverage.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Weight</th>
                  <th>Date</th>
                  <th>In</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map(({ p, d }) => (
                  <tr key={p.symbol}>
                    <td>{p.symbol}</td>
                    <td className="wrap">{p.name}</td>
                    <td>{fmtPct(p.weight, 1)}</td>
                    <td>
                      {new Date(
                        `${p.fundamentals?.earningsDate}T00:00:00`
                      ).toLocaleDateString("en-US")}
                    </td>
                    <td>{d} d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer
          className="muted"
          style={{ marginTop: 28, fontSize: 10, borderTop: "1px solid #e4e4e7", paddingTop: 8 }}
        >
          alpha · model-based analytics, not investment advice ·{" "}
          {generatedAt.toLocaleString("en-US")}
        </footer>
      </article>
    </div>
  );
}

/* ── dividend section ───────────────────────────────────────────────────── */

function DividendBlock({
  report,
  error,
  loading,
}: {
  report: DividendReport | null;
  error: boolean;
  loading: boolean;
}) {
  if (error) return <p className="note">Dividend data provider unreachable.</p>;
  if (!report)
    return (
      <p className="note">{loading ? "Loading dividend data…" : "Unavailable."}</p>
    );

  return (
    <>
      <div className="kpis avoid-break">
        <div className="kpi">
          <div className="label">Annual Income</div>
          <div className="value">{fmtUSD(report.annualIncome, true)}</div>
        </div>
        <div className="kpi">
          <div className="label">Portfolio Yield</div>
          <div className="value">{fmtPct(report.portfolioYield, 2)}</div>
        </div>
        <div className="kpi">
          <div className="label">Yield on Cost</div>
          <div className="value">{fmtPct(report.yieldOnCost, 2)}</div>
        </div>
        <div className="kpi">
          <div className="label">Grade</div>
          <div className="value">{report.grade}</div>
        </div>
        <div className="kpi">
          <div className="label">Safety</div>
          <div className="value">{report.safety}</div>
        </div>
        <div className="kpi">
          <div className="label">Growth</div>
          <div className="value">{report.growth}</div>
        </div>
        <div className="kpi">
          <div className="label">Stability</div>
          <div className="value">{report.stability}</div>
        </div>
        <div className="kpi">
          <div className="label">Diversification</div>
          <div className="value">{report.diversification}</div>
        </div>
      </div>

      <h3>Projected Income by Month</h3>
      <table>
        <thead>
          <tr>
            {report.calendar.map((m) => (
              <th key={m.month}>{MONTHS[m.month - 1]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {report.calendar.map((m) => (
              <td key={m.month}>{fmtUSDCompact(m.income)}</td>
            ))}
          </tr>
        </tbody>
      </table>

      <h3>5-Year Income Forecast</h3>
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Growth</th>
            <th>Year 1</th>
            <th>Year 3</th>
            <th>Year 5</th>
            <th>Year 5 (DRIP)</th>
          </tr>
        </thead>
        <tbody>
          {report.scenarios.map((s) => (
            <tr key={s.id}>
              <td>{s.label}</td>
              <td>{fmtPct(s.growth, 1)}</td>
              <td>{fmtUSD(s.y1, true)}</td>
              <td>{fmtUSD(s.y3, true)}</td>
              <td>{fmtUSD(s.y5, true)}</td>
              <td>{fmtUSD(s.y5Drip, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {report.holdings.length > 0 && (
        <>
          <h3>Per-Holding Dividends</h3>
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Income</th>
                <th>Yield</th>
                <th>YoC</th>
                <th>3y CAGR</th>
                <th>Streak</th>
                <th>Payout</th>
                <th>Safety</th>
              </tr>
            </thead>
            <tbody>
              {report.holdings.map((h) => (
                <tr key={h.symbol}>
                  <td>{h.symbol}</td>
                  <td>{fmtUSD(h.income, true)}</td>
                  <td>{h.currentYield !== null ? fmtPct(h.currentYield, 2) : "—"}</td>
                  <td>{h.yieldOnCost !== null ? fmtPct(h.yieldOnCost, 2) : "—"}</td>
                  <td>{h.cagr3 !== null ? fmtPct(h.cagr3, 1) : "—"}</td>
                  <td>{h.streak}y</td>
                  <td>{h.payoutRatio !== null ? fmtPct(h.payoutRatio, 0) : "—"}</td>
                  <td>{h.safety}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

/* ── market regime section ──────────────────────────────────────────────── */

function MarketBlock({
  report,
  error,
  loading,
}: {
  report: RegimeReport | null;
  error: boolean;
  loading: boolean;
}) {
  if (error) return <p className="note">Market data provider unreachable.</p>;
  if (!report)
    return (
      <p className="note">{loading ? "Loading market data…" : "Unavailable."}</p>
    );

  return (
    <>
      <div className="kpis avoid-break">
        <div className="kpi">
          <div className="label">Regime</div>
          <div className="value" style={{ fontSize: 14 }}>
            {report.regime}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Score (−100…+100)</div>
          <div className="value">{Math.round(report.score * 100)}</div>
        </div>
        <div className="kpi">
          <div className="label">Direction</div>
          <div className="value" style={{ fontSize: 14 }}>
            {report.direction}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Confidence</div>
          <div className="value">{Math.round(report.confidence)}</div>
        </div>
        <div className="kpi">
          <div className="label">Health</div>
          <div className="value">{Math.round(report.health)}</div>
        </div>
        <div className="kpi">
          <div className="label">Consensus</div>
          <div className="value" style={{ fontSize: 13 }}>
            {report.consensus}
          </div>
        </div>
      </div>

      <h3>Analytical Layers</h3>
      <table>
        <thead>
          <tr>
            <th>Layer</th>
            <th>Score</th>
            <th>Weight</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {report.layers.map((l) => (
            <tr key={l.id}>
              <td>{l.name}</td>
              <td>{l.score === null ? "—" : Math.round(l.score * 100)}</td>
              <td>{fmtPct(l.weight, 0)}</td>
              <td className="wrap">{l.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(report.drivers.bullish.length > 0 ||
        report.drivers.bearish.length > 0) && (
        <>
          <h3>Drivers</h3>
          {report.drivers.bullish.length > 0 && (
            <p>
              <strong>Tailwinds:</strong>{" "}
              {report.drivers.bullish.map((d) => d.label).join(" · ")}
            </p>
          )}
          {report.drivers.bearish.length > 0 && (
            <p>
              <strong>Headwinds:</strong>{" "}
              {report.drivers.bearish.map((d) => d.label).join(" · ")}
            </p>
          )}
          {report.drivers.shifts.length > 0 && (
            <p>
              <strong>Shifts:</strong>{" "}
              {report.drivers.shifts.map((d) => d.label).join(" · ")}
            </p>
          )}
        </>
      )}
    </>
  );
}
