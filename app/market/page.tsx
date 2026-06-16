"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkline } from "@/components/charts/Sparkline";
import { Card, CardHeader } from "@/components/ui/Card";
import { Computing } from "@/components/ui/Computing";
import { PageHeader } from "@/components/ui/PageHeader";
import type {
  DriverItem,
  LayerResult,
  RegimeLabel,
  RegimeReport,
} from "@/lib/analytics/regime/types";
import { fmtPct } from "@/lib/format";

const REFRESH_MS = 10 * 60_000;

function useMarketReport() {
  const [report, setReport] = useState<RegimeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/market");
      if (res.status === 401) {
        window.location.replace("/lock");
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      setReport((await res.json()) as RegimeReport);
    } catch {
      setError("Market data provider unreachable. The tape will wait.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return { report, error, loading, refresh: load };
}

/* ── Presentation helpers ─────────────────────────────────────────────── */

const REGIME_COLOR: Record<RegimeLabel, string> = {
  "Strong Risk-On": "var(--color-pos)",
  "Risk-On": "var(--color-mint)",
  Neutral: "var(--color-sky)",
  "Risk-Off": "var(--color-warn)",
  "Strong Risk-Off": "var(--color-neg)",
};

const fmtScore = (v: number) =>
  `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;

const scoreTone = (v: number) =>
  v >= 0.15 ? "text-pos" : v <= -0.15 ? "text-neg" : "text-mute";

/** Centered ±1 score bar (losses grow left, gains grow right). */
function ScoreBar({
  score,
  height = 6,
  className = "",
}: {
  score: number;
  height?: number;
  className?: string;
}) {
  const neg = score < 0;
  const color = neg ? "var(--color-neg)" : "var(--color-pos)";
  return (
    <div className={`relative ${className}`} style={{ height }}>
      <div className="absolute inset-0 rounded-full bg-white/[0.05]" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
      <motion.div
        className="absolute top-0 h-full rounded-full"
        style={{
          background: `color-mix(in srgb, ${color} 75%, transparent)`,
          ...(neg ? { right: "50%" } : { left: "50%" }),
        }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(Math.abs(score), 1) * 50}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/** The five-zone regime spectrum with a marker at the composite score. */
function Spectrum({ score, regime }: { score: number; regime: RegimeLabel }) {
  const pos = ((score + 1) / 2) * 100;
  return (
    <div>
      <div className="relative h-[10px] rounded-full"
        style={{
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--color-neg) 55%, transparent), color-mix(in srgb, var(--color-warn) 40%, transparent) 30%, color-mix(in srgb, var(--color-sky) 30%, transparent) 50%, color-mix(in srgb, var(--color-mint) 40%, transparent) 70%, color-mix(in srgb, var(--color-pos) 55%, transparent))",
        }}
      >
        {/* True zone boundaries: composite ±0.45 and ±0.15 mapped to 0–100% */}
        {[27.5, 42.5, 57.5, 72.5].map((x) => (
          <div
            key={x}
            className="absolute top-0 h-full w-px bg-black/40"
            style={{ left: `${x}%` }}
          />
        ))}
        <motion.div
          className="absolute top-1/2 h-[18px] w-[18px] rounded-full border-[3px] border-black"
          style={{ background: REGIME_COLOR[regime], y: "-50%", x: "-50%" }}
          initial={{ left: "50%" }}
          animate={{ left: `${pos}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[9.5px] uppercase tracking-wide text-faint">
        <span>Strong risk-off</span>
        <span className="hidden sm:inline">Risk-off</span>
        <span>Neutral</span>
        <span className="hidden sm:inline">Risk-on</span>
        <span>Strong risk-on</span>
      </div>
    </div>
  );
}

function LayerCard({ layer, i }: { layer: LayerResult; i: number }) {
  const s = layer.score;
  return (
    <Card className="flex flex-col px-4 py-4" i={i * 0.5 + 2} hover>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[13px] font-medium text-ink">{layer.name}</div>
        <span
          className="rounded border border-edge bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9.5px] text-faint"
          title="Share of the composite this layer earned: coverage × √(agreement × stability), renormalized across layers daily"
        >
          w {fmtPct(layer.weight, 0)}
        </span>
      </div>
      <div className="mt-0.5 text-[10.5px] text-faint">{layer.question}</div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className={`font-mono tnum text-[24px] font-medium ${s === null ? "text-faint" : scoreTone(s)}`}>
          {s === null ? "—" : fmtScore(s)}
        </span>
        {layer.delta21 !== null && Math.abs(layer.delta21) >= 0.05 && (
          <span
            className={`font-mono tnum text-[11px] ${layer.delta21 > 0 ? "text-pos" : "text-neg"}`}
            title="Change vs one month ago"
          >
            {fmtScore(layer.delta21)} / 1m
          </span>
        )}
      </div>
      <ScoreBar score={s ?? 0} className="mt-2" />

      <p className="mt-3 text-[11.5px] leading-snug text-mute">{layer.summary}</p>

      <div className="mt-3 space-y-1.5 border-t border-edge pt-3">
        {layer.signals.map((sg) => (
          <div
            key={sg.id}
            className="flex items-center gap-2"
            title={sg.detail}
          >
            <span className="min-w-0 flex-1 truncate text-[11px] text-mute">
              {sg.label}
            </span>
            <ScoreBar score={sg.score} height={4} className="w-14 shrink-0" />
            <span className={`w-8 shrink-0 text-right font-mono tnum text-[10.5px] ${scoreTone(sg.score)}`}>
              {fmtScore(sg.score)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-3 font-mono text-[9.5px] text-faint">
        agreement {layer.coherence === null ? "—" : layer.coherence.toFixed(2)} ·
        stability {layer.stability === null ? "—" : layer.stability.toFixed(2)} ·
        data {fmtPct(layer.coverage, 0)}
      </div>
    </Card>
  );
}

function DriverColumn({
  title,
  items,
  tone,
  empty,
}: {
  title: string;
  items: DriverItem[];
  tone: "pos" | "neg" | "shift";
  empty: string;
}) {
  return (
    <div>
      <div className="eyebrow mb-3">{title}</div>
      {items.length === 0 && (
        <div className="text-[11.5px] text-faint">{empty}</div>
      )}
      <div className="space-y-3">
        {items.map((d) => (
          <div key={`${d.layer}:${d.label}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12.5px] font-medium text-ink">
                {d.label}
              </span>
              <span
                className={`font-mono tnum text-[11px] ${
                  tone === "shift"
                    ? d.value > 0
                      ? "text-pos"
                      : "text-neg"
                    : tone === "pos"
                      ? "text-pos"
                      : "text-neg"
                }`}
              >
                {fmtScore(d.value)}
                {tone === "shift" ? " /1m" : ""}
              </span>
            </div>
            <div className="font-mono text-[9.5px] uppercase tracking-wide text-faint">
              {d.layer}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-mute">{d.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const VERDICT_STYLE: Record<string, string> = {
  "risk-on": "border-pos/30 bg-pos/10 text-pos",
  "risk-off": "border-neg/30 bg-neg/10 text-neg",
  neutral: "border-edge bg-white/[0.03] text-faint",
};

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function MarketPage() {
  const { report, error, loading, refresh } = useMarketReport();

  if (!report) {
    return (
      <div>
        <PageHeader
          eyebrow="Analysis"
          title="Market Analysis"
          description="Regime, risk appetite, and internal health — synthesized from price, breadth, leadership, volatility, and cross-asset flows."
        />
        <div className="relative">
          <Computing active={loading} label="reading the tape…" />
          {!loading && error ? (
            <div className="panel flex h-[360px] flex-col items-center justify-center gap-4 px-8 text-center">
              <div className="text-[13.5px] text-mute">{error}</div>
              <button onClick={refresh} className="btn-secondary">
                Retry
              </button>
            </div>
          ) : (
            <div className="panel h-[360px]" />
          )}
        </div>
      </div>
    );
  }

  const r = report;
  const regimeColor = REGIME_COLOR[r.regime];

  return (
    <div>
      <PageHeader
        eyebrow="Analysis"
        title="Market Analysis"
        description="Regime, risk appetite, and internal health — synthesized from price, breadth, leadership, volatility, and cross-asset flows."
      />

      {/* Regime hero */}
      <Card className="mb-5 px-6 py-6 sm:px-8" i={0} hover={false}>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div>
            <div className="eyebrow mb-1.5">Current regime</div>
            <div
              className="font-display text-[34px] font-semibold leading-none tracking-tight"
              style={{ color: regimeColor }}
            >
              {r.regime}
            </div>
            <div className="mt-2.5 text-[12px] text-mute">
              {r.consensus} · as of {r.asOf}
              {r.coverage.missing.length > 0 && (
                <span className="text-warn">
                  {" "}
                  · {r.coverage.missing.length} series unavailable
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-x-8 gap-y-4 sm:grid-cols-5">
            <div>
              <div className="eyebrow">Risk score</div>
              <div className={`mt-1 font-mono tnum text-[21px] font-medium ${scoreTone(r.score)}`}>
                {fmtScore(r.score)}
              </div>
              <div className="mt-0.5 text-[10.5px] text-faint">−100 … +100</div>
            </div>
            <div>
              <div className="eyebrow">Confidence</div>
              <div className="mt-1 font-mono tnum text-[21px] font-medium text-ink">
                {r.confidence}%
              </div>
              <div className="mt-0.5 text-[10.5px] text-faint">
                agreement {r.agreement.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="eyebrow">Health</div>
              <div
                className={`mt-1 font-mono tnum text-[21px] font-medium ${
                  r.health >= 60 ? "text-pos" : r.health >= 40 ? "text-warn" : "text-neg"
                }`}
              >
                {r.health}
              </div>
              <div className="mt-0.5 text-[10.5px] text-faint">internals, 0–100</div>
            </div>
            <div>
              <div className="eyebrow">Direction</div>
              <div
                className={`mt-1 font-mono tnum text-[21px] font-medium ${
                  r.direction === "Improving"
                    ? "text-pos"
                    : r.direction === "Deteriorating"
                      ? "text-neg"
                      : "text-mute"
                }`}
              >
                {r.direction === "Improving" ? "↗" : r.direction === "Deteriorating" ? "↘" : "→"}
              </div>
              <div className="mt-0.5 text-[10.5px] text-faint">{r.direction.toLowerCase()}</div>
            </div>
            <div>
              <div className="eyebrow">Regime age</div>
              <div className="mt-1 font-mono tnum text-[21px] font-medium text-ink">
                {r.maturityDays}
                {r.maturityCapped ? "+" : ""}
              </div>
              <div className="mt-0.5 text-[10.5px] text-faint">sessions</div>
            </div>
          </div>
        </div>

        <Spectrum score={r.score} regime={r.regime} />
      </Card>

      {/* Six-month replay */}
      <div className="mb-5 grid gap-5 md:grid-cols-2">
        <Card className="px-5 py-5" i={1}>
          <CardHeader
            eyebrow="Trailing 6 months"
            title="Risk-on / risk-off score"
            right={
              <span className={`font-mono tnum text-[13px] ${scoreTone(r.score)}`}>
                {fmtScore(r.score)}
              </span>
            }
            className="mb-3"
          />
          <Sparkline
            values={r.history.score.map((v) => v * 100)}
            baseline={0}
            height={72}
            color="var(--color-mint)"
            belowColor="var(--color-neg)"
          />
          <div className="mt-2 flex justify-between font-mono text-[9.5px] text-faint">
            <span>{r.history.dates[0]}</span>
            <span>persistence {r.persistence.toFixed(2)}</span>
            <span>{r.history.dates[r.history.dates.length - 1]}</span>
          </div>
        </Card>
        <Card className="px-5 py-5" i={1.5}>
          <CardHeader
            eyebrow="Trailing 6 months"
            title="Internal market health"
            right={
              <span className="font-mono tnum text-[13px] text-ink">{r.health}</span>
            }
            className="mb-3"
          />
          <Sparkline
            values={r.history.health}
            baseline={50}
            height={72}
            color="var(--color-sky)"
            belowColor="var(--color-warn)"
          />
          <div className="mt-2 flex justify-between font-mono text-[9.5px] text-faint">
            <span>{r.history.dates[0]}</span>
            <span>50 = neutral internals</span>
            <span>{r.history.dates[r.history.dates.length - 1]}</span>
          </div>
        </Card>
      </div>

      {/* Analytical layers */}
      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {r.layers.map((layer, i) => (
          <LayerCard key={layer.id} layer={layer} i={i} />
        ))}
      </div>

      {/* Key drivers */}
      <Card className="mb-5 px-6 py-5" i={4} hover={false}>
        <CardHeader
          eyebrow="Key drivers"
          title="What is moving the needle"
          right={
            <span className="font-mono text-[10px] text-faint">
              contribution-ranked across all layers
            </span>
          }
          className="mb-5"
        />
        <div className="grid gap-8 md:grid-cols-3">
          <DriverColumn
            title="Most bullish factors"
            items={r.drivers.bullish}
            tone="pos"
            empty="Nothing is pulling the composite up right now."
          />
          <DriverColumn
            title="Most bearish factors"
            items={r.drivers.bearish}
            tone="neg"
            empty="Nothing is dragging the composite down right now."
          />
          <DriverColumn
            title="Largest recent changes"
            items={r.drivers.shifts}
            tone="shift"
            empty="No signal moved materially this month."
          />
        </div>

        <div className="mt-6 grid gap-5 border-t border-edge pt-5 md:grid-cols-2">
          <div>
            <div className="eyebrow mb-2 !text-warn/80">Emerging risks</div>
            {r.drivers.risks.length === 0 ? (
              <div className="text-[11.5px] text-faint">
                No acute deterioration flags in the current data.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {r.drivers.risks.map((risk) => (
                  <li key={risk} className="flex gap-2 text-[11.5px] leading-snug text-mute">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-warn/70" />
                    {risk}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="eyebrow mb-2 !text-mint/80">Emerging opportunities</div>
            {r.drivers.opportunities.length === 0 ? (
              <div className="text-[11.5px] text-faint">
                Nothing newly improving stands out this month.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {r.drivers.opportunities.map((opp) => (
                  <li key={opp} className="flex gap-2 text-[11.5px] leading-snug text-mute">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-mint/70" />
                    {opp}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      {/* Trend table & capital flows */}
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden" i={5}>
          <CardHeader
            eyebrow="Trend analysis"
            title="Index trend states"
            className="px-5 pt-5 mb-2"
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12px]">
              <thead>
                <tr className="border-b border-edge text-left">
                  {["Index", "1m", "3m", "50d", "200d", "Slope/yr", "Consistency", "Stretch"].map(
                    (h, hi) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-[11px] font-medium text-faint ${hi > 0 ? "text-right" : ""}`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {r.trendTable.map((row) => (
                  <tr key={row.symbol} className="border-b border-edge/60 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-medium text-ink">{row.symbol}</span>
                      <span className="ml-2 hidden text-[10.5px] text-faint lg:inline">
                        {row.label}
                      </span>
                    </td>
                    <Pct v={row.ret21} />
                    <Pct v={row.ret63} />
                    <Check v={row.above50} />
                    <Check v={row.above200} />
                    <Pct v={row.slope} digits={0} />
                    <td className="px-4 py-2.5 text-right font-mono tnum text-mute">
                      {row.consistency === null ? "—" : fmtPct(row.consistency, 0)}
                    </td>
                    <Pct v={row.stretch} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[10.5px] leading-snug text-faint">
            Consistency = share of the last quarter above the 50-day. Stretch =
            distance from the 50-day; large stretch cuts trend quality.
          </p>
        </Card>

        <Card className="overflow-hidden" i={5.5}>
          <CardHeader
            eyebrow="Relative strength"
            title="Where capital is flowing"
            className="px-5 pt-5 mb-2"
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[12px]">
              <thead>
                <tr className="border-b border-edge text-left">
                  {["Pair", "1m", "3m", "Trend", "Read"].map((h, hi) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[11px] font-medium text-faint ${hi > 0 ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.ratios.map((row) => (
                  <tr key={row.id} className="border-b border-edge/60 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <div className="text-[12px] text-ink">{row.label}</div>
                      <div className="font-mono text-[9.5px] text-faint">
                        {row.a}/{row.b}
                      </div>
                    </td>
                    <Pct v={row.ret21} />
                    <Pct v={row.ret63} />
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-mono tnum ${row.score === null ? "text-faint" : scoreTone(row.score)}`}>
                        {row.score === null ? "—" : fmtScore(row.score)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[9.5px] ${VERDICT_STYLE[row.verdict]}`}
                      >
                        {row.verdict}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[10.5px] leading-snug text-faint">
            Each pair is risk-seeking over safety-seeking; a rising ratio means
            the risk leg is being accumulated.
          </p>
        </Card>
      </div>

      {/* Methodology */}
      <Card className="px-6 py-5" i={6} hover={false}>
        <CardHeader
          eyebrow="Explainability"
          title="How this is computed"
          right={
            <button onClick={refresh} className="btn-secondary !h-7 !px-3 !text-[11px]">
              Refresh
            </button>
          }
          className="mb-4"
        />
        <ol className="grid gap-x-8 gap-y-2 md:grid-cols-2">
          {r.methodology.map((m, i) => (
            <li key={m} className="flex gap-2.5 text-[11.5px] leading-relaxed text-mute">
              <span className="font-mono text-[10px] text-faint">{`0${i + 1}`.slice(-2)}</span>
              {m}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Pct({ v, digits = 1 }: { v: number | null; digits?: number }) {
  return (
    <td
      className={`px-4 py-2.5 text-right font-mono tnum ${
        v === null ? "text-faint" : v > 0 ? "text-pos" : v < 0 ? "text-neg" : "text-mute"
      }`}
    >
      {v === null ? "—" : fmtPct(v, digits, true)}
    </td>
  );
}

function Check({ v }: { v: boolean | null }) {
  return (
    <td className="px-4 py-2.5 text-right font-mono">
      {v === null ? (
        <span className="text-faint">—</span>
      ) : v ? (
        <span className="text-pos">✓</span>
      ) : (
        <span className="text-neg">✗</span>
      )}
    </td>
  );
}
