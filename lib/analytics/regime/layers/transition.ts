import { at, mean, ret, sma, toScore } from "../mathx";
import { INDICES, POSTURE_SCORE, SECTORS } from "../universe";
import { band, pct, ratioSeries, sig, type LayerSpec } from "./spec";

type Ctx = Parameters<LayerSpec["compute"]>[0];

/** Share of the given symbols above their 50-day average. */
function fracAbove50(ctx: Ctx, t: number, symbols: string[]): number | null {
  let above = 0;
  let total = 0;
  for (const sym of symbols) {
    if (!ctx.has(sym)) continue;
    const p = at(ctx.s(sym), t);
    const m = sma(ctx.s(sym), t, 50);
    if (p === null || m === null) continue;
    total++;
    if (p > m) above++;
  }
  return total >= Math.min(3, symbols.length) ? above / total : null;
}

/** Average posture of the top-3 sectors by 3-month relative return. */
function leaderPosture(ctx: Ctx, t: number): number | null {
  const spy = ret(ctx.s("SPY"), t, 63);
  if (spy === null) return null;
  const rows: { posture: number; rel: number }[] = [];
  for (const s of SECTORS) {
    if (!ctx.has(s.symbol)) continue;
    const r = ret(ctx.s(s.symbol), t, 63);
    if (r === null) continue;
    rows.push({ posture: POSTURE_SCORE[s.posture], rel: r - spy });
  }
  if (rows.length < 8) return null;
  rows.sort((a, b) => b.rel - a.rel);
  return mean(rows.slice(0, 3).map((r) => r.posture));
}

/**
 * Regime-transition layer: first derivatives. Each signal asks whether a
 * pillar of the current regime got stronger or weaker over the last month —
 * the place where regime changes show up before they're obvious.
 */
export const transitionLayer: LayerSpec = {
  id: "transition",
  name: "Regime Transition",
  question: "Are conditions improving or deteriorating?",

  compute(ctx, t) {
    const indexSyms = INDICES.map((i) => i.symbol);
    const sectorSyms = SECTORS.map((s) => s.symbol);

    // Trend pillar: indices holding or losing their trend lines.
    const trNow = fracAbove50(ctx, t, indexSyms);
    const trThen = fracAbove50(ctx, t - 21, indexSyms);
    const trendShift =
      trNow !== null && trThen !== null
        ? sig(
            "trend-shift",
            "Trend deterioration watch",
            trNow - trThen,
            trNow === trThen
              ? "No index gained or lost its 50-day trend this month."
              : `Indices above their 50-day went ${pct(trThen, 0)} → ${pct(trNow, 0)} this month.`
          )
        : null;

    // Breadth pillar: participation expanding or bleeding out.
    const brNow = fracAbove50(ctx, t, sectorSyms);
    const brThen = fracAbove50(ctx, t - 21, sectorSyms);
    const breadthShift =
      brNow !== null && brThen !== null
        ? sig(
            "breadth-shift",
            "Breadth deterioration watch",
            brNow - brThen,
            `Sector participation moved ${pct(brNow - brThen, 0, true)} pts over the month.`
          )
        : null;

    // Volatility pillar: fear repricing, ranked against typical repricings.
    const volP = ctx.pctl(
      "vol-shift",
      (τ) => {
        const a = at(ctx.s("^VIX"), τ);
        const b = at(ctx.s("^VIX"), τ - 21);
        return a !== null && b !== null && b > 0 ? Math.log(a / b) : null;
      },
      t
    );
    const volShift =
      volP !== null
        ? sig(
            "vol-shift",
            "Volatility expansion watch",
            -toScore(volP),
            volP > 0.5
              ? "Implied volatility is repricing higher faster than usual."
              : "Implied volatility is compressing — stress draining out."
          )
        : null;

    // Credit pillar: the bond market usually blinks first.
    let creditShift = null;
    if (ctx.has("HYG") && ctx.has("LQD")) {
      const ratio = ratioSeries(ctx, "HYG", "LQD");
      const cP = ctx.pctl(
        "credit-shift",
        (τ) => {
          const a = ret(ratio, τ, 21);
          const b = ret(ratio, τ - 21, 21);
          return a !== null && b !== null ? a - b : null;
        },
        t
      );
      if (cP !== null) {
        creditShift = sig(
          "credit-shift",
          "Credit turn watch",
          toScore(cP),
          cP >= 0.5
            ? "Credit risk appetite is improving at the margin."
            : "Credit risk appetite is fading at the margin — an early-warning tell."
        );
      }
    }

    // Leadership pillar: rotating toward offense or defense?
    const lpNow = leaderPosture(ctx, t);
    const lpThen = leaderPosture(ctx, t - 21);
    const leaderShift =
      lpNow !== null && lpThen !== null
        ? sig(
            "leader-shift",
            "Leadership rotation watch",
            (lpNow - lpThen) / 2,
            Math.abs(lpNow - lpThen) < 0.2
              ? "Leadership character is stable month-over-month."
              : lpNow > lpThen
                ? "Leadership is rotating toward offensive groups."
                : "Leadership is rotating toward defensive groups."
          )
        : null;

    return [trendShift, breadthShift, volShift, creditShift, leaderShift];
  },

  summarize(score) {
    return band(
      score,
      "Conditions are improving on every pillar — a constructive transition.",
      "The margin is improving: breadth, credit, or vol turning better.",
      "The current regime looks stable — no transition underway.",
      "Pillars of the current regime are eroding — early transition signs.",
      "Multiple pillars deteriorating at once — a regime change is underway."
    );
  },
};
