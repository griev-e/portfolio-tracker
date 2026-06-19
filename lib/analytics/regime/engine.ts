import type { MarketContext } from "./context";
import { LAYERS } from "./layers";
import { clamp, logSlope, mean, ret, sma, stdev, weightedScore, at } from "./mathx";
import { INDICES, PAIRS } from "./universe";
import { ratioSeries } from "./layers/spec";
import type {
  ConsensusLabel,
  DirectionLabel,
  DriverItem,
  LayerResult,
  RatioRow,
  RegimeLabel,
  RegimeReport,
  SignalResult,
  TrendRow,
} from "./types";

/** Sessions of composite history to replay (~6 months). */
const REPLAY = 126;
/** "Recent change" window — one trading month. */
const DELTA = 21;

interface Frame {
  score: number | null;
  coherence: number | null;
  coverage: number;
}

/**
 * Blend a layer's signals. Signal significance is dynamic: the further a
 * reading sits from its own historical norm (|score|), the more it says, so
 * the more it weighs. No per-signal thresholds or layer weights are hand-tuned
 * (the aggregation/labelling step does carry structural constants).
 */
function evalLayer(signals: (SignalResult | null)[]): Frame & {
  got: SignalResult[];
} {
  const got = signals.filter((s): s is SignalResult => s !== null);
  const coverage = signals.length > 0 ? got.length / signals.length : 0;
  if (got.length === 0) return { score: null, coherence: null, coverage, got };
  const ws = weightedScore(
    got.map((s) => s.score),
    got.map((s) => 0.5 + Math.abs(s.score))
  )!;
  return {
    score: ws.score,
    coherence: clamp(1 - ws.dispersion * 1.5, 0, 1),
    coverage,
    got,
  };
}

const regimeLabel = (score: number): RegimeLabel =>
  score >= 0.45
    ? "Strong Risk-On"
    : score >= 0.15
      ? "Risk-On"
      : score > -0.15
        ? "Neutral"
        : score > -0.45
          ? "Risk-Off"
          : "Strong Risk-Off";

const consensusLabel = (agreement: number): ConsensusLabel =>
  agreement >= 0.7
    ? "Strong Consensus"
    : agreement >= 0.5
      ? "Moderate Consensus"
      : agreement >= 0.3
        ? "Mixed Signals"
        : "Highly Conflicted";

/** Layers describing internal market quality (feeds the health score). */
const HEALTH_LAYERS = new Set([
  "trend",
  "breadth",
  "volatility",
  "structure",
  "momentum",
]);

const sign = (v: number) => (v > 0.05 ? 1 : v < -0.05 ? -1 : 0);

export function buildRegimeReport(
  ctx: MarketContext,
  coverage: RegimeReport["coverage"]
): RegimeReport {
  const tNow = ctx.dates.length - 1;
  if (tNow < 60) throw new Error("not enough market history");

  const tH0 = Math.max(DELTA, tNow - REPLAY + 1); // first replayed session
  const tStart = Math.max(0, tH0 - DELTA); // extra runway for stability windows

  // ── Pass 1: raw layer evaluations across the replay window ──────────────
  const frames: Frame[][] = LAYERS.map(() => []);
  const signalsNow: SignalResult[][] = LAYERS.map(() => []);
  const signalsThen: SignalResult[][] = LAYERS.map(() => []);

  for (let t = tStart; t <= tNow; t++) {
    LAYERS.forEach((layer, li) => {
      const ev = evalLayer(layer.compute(ctx, t));
      frames[li][t - tStart] = ev;
      if (t === tNow) signalsNow[li] = ev.got;
      if (t === tNow - DELTA) signalsThen[li] = ev.got;
    });
  }

  const frameAt = (li: number, t: number): Frame | null =>
    t >= tStart && t <= tNow ? frames[li][t - tStart] : null;

  /** 0…1 — how steady a layer's score has been over the trailing month. */
  const stabilityAt = (li: number, t: number): number | null => {
    const vals: number[] = [];
    for (let τ = Math.max(tStart, t - DELTA + 1); τ <= t; τ++) {
      const f = frameAt(li, τ);
      if (f?.score !== null && f?.score !== undefined) vals.push(f.score);
    }
    if (vals.length < 10) return null;
    return clamp(1 - (stdev(vals) ?? 0) * 2, 0, 1);
  };

  // ── Pass 2: dynamic weights → composite & health, replayed daily ────────
  // A layer earns weight from data coverage, internal agreement, and how
  // steady its own conclusion has been — never from a hardcoded importance.
  const weightsAt = (t: number): (number | null)[] => {
    const quality = LAYERS.map((_, li) => {
      const f = frameAt(li, t);
      if (!f || f.score === null) return null;
      const stab = stabilityAt(li, t) ?? 0.5;
      const coh = f.coherence ?? 0.5;
      return Math.max(0.01, f.coverage * Math.sqrt(coh * stab));
    });
    const total = quality.reduce<number>((a, q) => a + (q ?? 0), 0);
    return quality.map((q) => (q === null || total === 0 ? null : q / total));
  };

  const compositeAt = (t: number): { score: number; health: number } | null => {
    const w = weightsAt(t);
    let score = 0;
    let any = false;
    let hw = 0;
    let hs = 0;
    LAYERS.forEach((layer, li) => {
      const wi = w[li];
      const f = frameAt(li, t);
      if (wi === null || !f || f.score === null) return;
      any = true;
      score += wi * f.score;
      if (HEALTH_LAYERS.has(layer.id)) {
        hw += wi;
        hs += wi * f.score;
      }
    });
    if (!any) return null;
    const health = hw > 0 ? clamp(50 * (1 + hs / hw), 0, 100) : 50;
    return { score, health };
  };

  const histDates: string[] = [];
  const histScore: number[] = [];
  const histHealth: number[] = [];
  for (let t = tH0; t <= tNow; t++) {
    const c = compositeAt(t);
    if (!c) continue;
    histDates.push(ctx.dates[t]);
    histScore.push(c.score);
    histHealth.push(c.health);
  }
  if (histScore.length === 0) throw new Error("composite not computable");

  const nowComposite = histScore[histScore.length - 1];
  const nowHealth = histHealth[histHealth.length - 1];
  const finalWeights = weightsAt(tNow);

  // ── Layer results ────────────────────────────────────────────────────────
  const layers: LayerResult[] = LAYERS.map((layer, li) => {
    const f = frameAt(li, tNow)!;
    const then = frameAt(li, tNow - DELTA);
    return {
      id: layer.id,
      name: layer.name,
      question: layer.question,
      score: f.score,
      coherence: f.coherence,
      stability: stabilityAt(li, tNow),
      coverage: f.coverage,
      weight: finalWeights[li] ?? 0,
      summary:
        f.score === null
          ? "Not enough data to evaluate this layer."
          : layer.summarize(f.score),
      signals: signalsNow[li],
      delta21:
        f.score !== null && then?.score != null ? f.score - then.score : null,
    };
  });

  // ── Consensus & confidence ───────────────────────────────────────────────
  const active = layers.filter((l) => l.score !== null);
  let dispersion = 0;
  let signAgree = 0;
  for (const l of active) {
    dispersion += l.weight * (l.score! - nowComposite) ** 2;
    signAgree +=
      l.weight *
      (sign(nowComposite) === 0
        ? 0.5
        : sign(l.score!) === 0
          ? 0.5
          : sign(l.score!) === sign(nowComposite)
            ? 1
            : 0);
  }
  dispersion = Math.sqrt(dispersion);
  const agreement = clamp(
    Math.sqrt(clamp(1 - dispersion * 1.5, 0, 1) * clamp(signAgree, 0, 1)),
    0,
    1
  );

  const persistWindow = histScore.slice(-DELTA);
  const signFrac =
    mean(
      persistWindow.map((c) =>
        sign(c) === sign(nowComposite) ? 1 : sign(c) === 0 || sign(nowComposite) === 0 ? 0.5 : 0
      )
    ) ?? 0.5;
  const magStab = clamp(1 - (stdev(persistWindow) ?? 0) * 2, 0, 1);
  const persistence = clamp(Math.sqrt(signFrac * magStab), 0, 1);

  const breadthScore = layers.find((l) => l.id === "breadth")?.score ?? null;
  const breadthFactor = breadthScore === null ? 0.5 : (1 + breadthScore) / 2;
  const transitionScore =
    layers.find((l) => l.id === "transition")?.score ?? null;
  const transitionFactor =
    transitionScore === null
      ? 0.75
      : clamp(1 - Math.abs(transitionScore) * 1.5, 0.05, 1);

  const confidence = Math.round(
    clamp(
      100 *
        Math.pow(
          Math.max(1e-6, agreement * persistence * breadthFactor * transitionFactor),
          0.25
        ),
      1,
      99
    )
  );

  // ── Maturity & direction ─────────────────────────────────────────────────
  const bucket = (c: number) => (c >= 0.15 ? 1 : c <= -0.15 ? -1 : 0);
  const nowBucket = bucket(nowComposite);
  let maturity = 0;
  for (let i = histScore.length - 1; i >= 0; i--) {
    if (bucket(histScore[i]) !== nowBucket) break;
    maturity++;
  }
  const maturityCapped = maturity === histScore.length;

  const recent = histScore.slice(-DELTA);
  let drift = 0;
  if (recent.length >= 10) {
    const xm = (recent.length - 1) / 2;
    const ym = mean(recent)!;
    let sxy = 0;
    let sxx = 0;
    recent.forEach((y, i) => {
      sxy += (i - xm) * (y - ym);
      sxx += (i - xm) ** 2;
    });
    drift = (sxy / sxx) * (recent.length - 1);
  }
  const direction: DirectionLabel =
    drift >= 0.06 ? "Improving" : drift <= -0.06 ? "Deteriorating" : "Stable";

  // ── Key drivers ──────────────────────────────────────────────────────────
  const contributions: { item: DriverItem; contrib: number }[] = [];
  layers.forEach((l) => {
    if (l.score === null || l.signals.length === 0) return;
    const sw = l.signals.map((s) => 0.5 + Math.abs(s.score));
    const swTotal = sw.reduce((a, b) => a + b, 0);
    l.signals.forEach((s, i) => {
      contributions.push({
        item: { label: s.label, layer: l.name, detail: s.detail, value: s.score },
        contrib: l.weight * (sw[i] / swTotal) * s.score,
      });
    });
  });
  const bullish = contributions
    .filter((c) => c.contrib > 0.004)
    .sort((a, b) => b.contrib - a.contrib)
    .slice(0, 4)
    .map((c) => c.item);
  const bearish = contributions
    .filter((c) => c.contrib < -0.004)
    .sort((a, b) => a.contrib - b.contrib)
    .slice(0, 4)
    .map((c) => c.item);

  const shifts: DriverItem[] = [];
  const improvers: { label: string; layer: string; detail: string; d: number }[] = [];
  LAYERS.forEach((_, li) => {
    for (const now of signalsNow[li]) {
      const then = signalsThen[li].find((s) => s.id === now.id);
      if (!then) continue;
      const d = now.score - then.score;
      if (Math.abs(d) >= 0.15) {
        shifts.push({
          label: now.label,
          layer: layers[li].name,
          detail: `${Math.round(then.score * 100)} → ${Math.round(now.score * 100)} over the month. ${now.detail}`,
          value: d,
        });
      }
      if (d >= 0.2) {
        improvers.push({ label: now.label, layer: layers[li].name, detail: now.detail, d });
      }
    }
  });
  shifts.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const risks: string[] = [];
  const transitionL = layers.find((l) => l.id === "transition");
  for (const s of transitionL?.signals ?? []) {
    if (s.score <= -0.3) risks.push(s.detail);
  }
  for (const l of layers) {
    if (l.id === "transition") continue;
    for (const s of l.signals) {
      if (s.score <= -0.55) risks.push(`${s.label}: ${s.detail}`);
    }
  }
  const opportunities = improvers
    .sort((a, b) => b.d - a.d)
    .slice(0, 4)
    .map((i) => `${i.label} (${i.layer}) is improving — ${i.detail}`);

  // ── Trend table & capital-flow ratios ────────────────────────────────────
  const trendTable: TrendRow[] = INDICES.filter((i) => ctx.has(i.symbol)).map(
    (i) => {
      const s = ctx.s(i.symbol);
      const p = at(s, tNow);
      const m50 = sma(s, tNow, 50);
      const m200 = sma(s, tNow, 200);
      let above = 0;
      let total = 0;
      for (let τ = tNow - 62; τ <= tNow; τ++) {
        const v = at(s, τ);
        const m = sma(s, τ, 50);
        if (v === null || m === null) continue;
        total++;
        if (v > m) above++;
      }
      return {
        symbol: i.symbol,
        label: i.label,
        ret21: ret(s, tNow, 21),
        ret63: ret(s, tNow, 63),
        above50: p !== null && m50 !== null ? p > m50 : null,
        above200: p !== null && m200 !== null ? p > m200 : null,
        slope: logSlope(s, tNow, 63)?.slope ?? null,
        consistency: total >= 40 ? above / total : null,
        stretch: p !== null && m50 !== null && m50 > 0 ? p / m50 - 1 : null,
      };
    }
  );

  const ratios: RatioRow[] = PAIRS.filter(
    (p) => ctx.has(p.a) && ctx.has(p.b)
  ).map((p) => {
    const series = ratioSeries(ctx, p.a, p.b);
    const pc = ctx.pctl(
      `pair-slope:${p.id}`,
      (τ) => logSlope(series, τ, 63)?.slope ?? null,
      tNow
    );
    const score = pc === null ? null : clamp(2 * pc - 1, -1, 1);
    return {
      id: p.id,
      label: p.label,
      a: p.a,
      b: p.b,
      score,
      ret21: ret(series, tNow, 21),
      ret63: ret(series, tNow, 63),
      verdict:
        score === null
          ? "neutral"
          : score >= 0.25
            ? "risk-on"
            : score <= -0.25
              ? "risk-off"
              : "neutral",
    };
  });

  return {
    asOf: ctx.dates[tNow],
    generatedAt: new Date().toISOString(),
    coverage,
    score: nowComposite,
    regime: regimeLabel(nowComposite),
    confidence,
    consensus: consensusLabel(agreement),
    agreement,
    persistence,
    health: Math.round(nowHealth),
    maturityDays: maturity,
    maturityCapped,
    direction,
    directionSlope: drift,
    layers,
    history: { dates: histDates, score: histScore, health: histHealth },
    drivers: {
      bullish,
      bearish,
      shifts: shifts.slice(0, 4),
      risks: [...new Set(risks)].slice(0, 4),
      opportunities,
    },
    trendTable,
    ratios,
    methodology: [
      "Every signal is scored against its own trailing-year distribution (percentile rank), not against fixed thresholds — \"high\" always means \"high for this market.\"",
      "Signal significance is dynamic: the further a reading sits from its historical norm, the more weight it carries inside its layer.",
      "Layer weights are earned, not assigned — each layer's share of the composite comes from its data coverage, internal signal agreement, and month-long stability.",
      "Confidence blends four independent checks: cross-layer agreement, signal persistence over the trailing month, breadth of participation, and whether a regime transition is underway.",
      "The market health score aggregates only the internal-quality layers (trend, breadth, volatility, structure, momentum) under the same dynamic weights.",
      "History is replayed with backward-looking windows only — the trailing six-month regime track contains no lookahead.",
      "This describes the current state of the market. It is not a prediction.",
    ],
  };
}
