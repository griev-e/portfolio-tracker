import { at, logSlope, mean, ret, sma, toScore } from "../mathx";
import { INDICES } from "../universe";
import { band, ordinal, pct, sig, type LayerSpec } from "./spec";

/**
 * Trend layer: quality and persistence of the primary trend across the four
 * index lenses (cap-weight, mega-cap growth, small caps, equal-weight).
 */
export const trendLayer: LayerSpec = {
  id: "trend",
  name: "Trend",
  question: "Are trends strengthening or weakening?",

  compute(ctx, t) {
    const idx = INDICES.filter((i) => ctx.has(i.symbol));

    // Moving-average structure: price>50d and 50d>200d across indices.
    let pass = 0;
    let checks = 0;
    for (const i of idx) {
      const s = ctx.s(i.symbol);
      const p = at(s, t);
      const m50 = sma(s, t, 50);
      const m200 = sma(s, t, 200);
      if (p !== null && m50 !== null) {
        checks++;
        if (p > m50) pass++;
      }
      if (m50 !== null && m200 !== null) {
        checks++;
        if (m50 > m200) pass++;
      }
    }
    const structure =
      checks >= 4
        ? sig(
            "ma-structure",
            "Moving-average structure",
            toScore(pass / checks),
            `${pass} of ${checks} bullish alignment checks pass (price>50d, 50d>200d across ${idx.length} indices).`
          )
        : null;

    // Trend slope: 63-session log-price slope vs its own year of history.
    const slopeScores: number[] = [];
    let spySlope: number | null = null;
    let spySlopeP: number | null = null;
    for (const i of idx) {
      const p = ctx.pctl(
        `slope63:${i.symbol}`,
        (τ) => logSlope(ctx.s(i.symbol), τ, 63)?.slope ?? null,
        t
      );
      if (p === null) continue;
      slopeScores.push(toScore(p));
      if (i.symbol === "SPY") {
        spySlope = logSlope(ctx.s("SPY"), t, 63)?.slope ?? null;
        spySlopeP = p;
      }
    }
    const slopeAvg = mean(slopeScores);
    const slope =
      slopeAvg !== null
        ? sig(
            "slope",
            "Trend slope",
            slopeAvg,
            spySlope !== null && spySlopeP !== null
              ? `S&P trend annualizes to ${pct(spySlope, 0, true)} — ${ordinal(spySlopeP)} percentile of its trailing year; the score averages ${slopeScores.length} indices.`
              : `Average slope percentile across ${slopeScores.length} indices.`
          )
        : null;

    // Consistency: share of the last quarter spent above the 50-day.
    const consVals: number[] = [];
    let spyCons: number | null = null;
    for (const i of idx) {
      const s = ctx.s(i.symbol);
      let above = 0;
      let total = 0;
      for (let τ = t - 62; τ <= t; τ++) {
        const p = at(s, τ);
        const m = sma(s, τ, 50);
        if (p === null || m === null) continue;
        total++;
        if (p > m) above++;
      }
      if (total >= 40) {
        consVals.push(above / total);
        if (i.symbol === "SPY") spyCons = above / total;
      }
    }
    const consAvg = mean(consVals);
    const consistency =
      consAvg !== null
        ? sig(
            "consistency",
            "Trend consistency",
            toScore(consAvg),
            spyCons !== null
              ? `S&P closed above its 50-day on ${pct(spyCons, 0)} of sessions this quarter.`
              : `Indices held their 50-day averages ${pct(consAvg, 0)} of the quarter.`
          )
        : null;

    // Multi-timeframe agreement: sign of 1m/3m/6m returns across indices.
    let posTf = 0;
    let totTf = 0;
    for (const i of idx) {
      for (const n of [21, 63, 126]) {
        const r = ret(ctx.s(i.symbol), t, n);
        if (r === null) continue;
        totTf++;
        if (r > 0) posTf++;
      }
    }
    const multiTf =
      totTf >= 6
        ? sig(
            "multi-tf",
            "Multi-timeframe agreement",
            toScore(posTf / totTf),
            `${posTf} of ${totTf} index × timeframe (1m/3m/6m) returns are positive.`
          )
        : null;

    // Exhaustion: how stretched price is from trend vs the usual stretch.
    const stretchScores: number[] = [];
    let spyStretch: number | null = null;
    let spyStretchP: number | null = null;
    for (const symbol of ["SPY", "QQQ"]) {
      if (!ctx.has(symbol)) continue;
      const p = ctx.pctl(
        `stretch:${symbol}`,
        (τ) => {
          const v = at(ctx.s(symbol), τ);
          const m = sma(ctx.s(symbol), τ, 50);
          return v !== null && m !== null && m > 0 ? Math.abs(v / m - 1) : null;
        },
        t
      );
      if (p === null) continue;
      stretchScores.push(1 - 2 * p); // extreme stretch (either way) = fragile
      if (symbol === "SPY") {
        const v = at(ctx.s("SPY"), t);
        const m = sma(ctx.s("SPY"), t, 50);
        spyStretch = v !== null && m !== null && m > 0 ? v / m - 1 : null;
        spyStretchP = p;
      }
    }
    const stretchAvg = mean(stretchScores);
    const exhaustion =
      stretchAvg !== null
        ? sig(
            "exhaustion",
            "Trend exhaustion",
            stretchAvg,
            spyStretch !== null && spyStretchP !== null
              ? `S&P sits ${pct(spyStretch, 1, true)} from its 50-day — ${ordinal(spyStretchP)} percentile stretch (extremes cut trend quality).`
              : "Distance from trend vs its own history."
          )
        : null;

    return [structure, slope, consistency, multiTf, exhaustion];
  },

  summarize(score) {
    return band(
      score,
      "Trends are strong, aligned across indices, and persistent.",
      "The primary trend is up with reasonable persistence.",
      "Trend signals are flat to mixed — no dominant direction.",
      "Trends are weakening across timeframes.",
      "Downtrends dominate every lens we track."
    );
  },
};
