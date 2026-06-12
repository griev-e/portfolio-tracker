import { dailyReturns, mean, pearson, ret, stdev, toScore } from "../mathx";
import { SECTORS } from "../universe";
import { band, ordinal, pct, ratioSeries, sig, type LayerSpec } from "./spec";

type Ctx = Parameters<LayerSpec["compute"]>[0];

/** Average pairwise correlation of sector daily returns over `win` days. */
function avgSectorCorrelation(ctx: Ctx, t: number, win: number): number | null {
  const rets: number[][] = [];
  for (const s of SECTORS) {
    if (!ctx.has(s.symbol)) continue;
    const r = dailyReturns(ctx.s(s.symbol), t, win);
    if (r) rets.push(r);
  }
  if (rets.length < 8) return null;
  const cs: number[] = [];
  for (let i = 0; i < rets.length; i++) {
    for (let j = i + 1; j < rets.length; j++) {
      const c = pearson(rets[i], rets[j]);
      if (c !== null) cs.push(c);
    }
  }
  return mean(cs);
}

/**
 * Market-structure layer: internal quality. Correlation regime, return
 * dispersion, concentration, and whether the parts move with the whole.
 */
export const structureLayer: LayerSpec = {
  id: "structure",
  name: "Market Structure",
  question: "Is the market internally sound?",

  compute(ctx, t) {
    // Correlation level: everything-moves-together is a fragile market.
    const corrP = ctx.pctl(
      "avg-corr",
      (τ) => avgSectorCorrelation(ctx, τ, 42),
      t,
      252
    );
    const corrNow = avgSectorCorrelation(ctx, t, 42);
    const correlation =
      corrP !== null
        ? sig(
            "correlation",
            "Cross-sector correlation",
            -toScore(corrP),
            corrNow !== null
              ? `Average pairwise sector correlation ${corrNow.toFixed(2)} — ${ordinal(corrP)} percentile${corrP > 0.7 ? " (lockstep trading = fragility)" : ""}.`
              : "Correlation percentile."
          )
        : null;

    // Correlation shift: relationships becoming unstable?
    const shiftP = ctx.pctl(
      "corr-shift",
      (τ) => {
        const short = avgSectorCorrelation(ctx, τ, 21);
        const long = avgSectorCorrelation(ctx, τ, 63);
        return short !== null && long !== null ? short - long : null;
      },
      t,
      252
    );
    const corrShift =
      shiftP !== null
        ? sig(
            "corr-trend",
            "Correlation regime shift",
            -toScore(shiftP),
            shiftP > 0.5
              ? "Short-term correlations are rising above trend — cohesion under stress."
              : "Short-term correlations sit below trend — relationships are relaxing."
          )
        : null;

    // Dispersion: healthy markets differentiate; extremes either way hurt.
    const dispP = ctx.pctl(
      "dispersion",
      (τ) => {
        const rs: number[] = [];
        for (const s of SECTORS) {
          if (!ctx.has(s.symbol)) continue;
          const r = ret(ctx.s(s.symbol), τ, 21);
          if (r !== null) rs.push(r);
        }
        return rs.length >= 8 ? (stdev(rs) ?? null) : null;
      },
      t
    );
    const dispersion =
      dispP !== null
        ? sig(
            "dispersion",
            "Return dispersion",
            1 - 2 * Math.abs(toScore(dispP)), // mid-range = healthy
            `Sector return spread is at the ${ordinal(dispP)} percentile — ${
              dispP > 0.8
                ? "extreme divergence (unstable)"
                : dispP < 0.2
                  ? "unusually compressed (indiscriminate)"
                  : "mid-range (healthy differentiation)"
            }.`
          )
        : null;

    // Concentration: mega-cap complex vs the broad tape, magnitude only.
    const qqqSpy = ratioSeries(ctx, "QQQ", "SPY");
    const concP = ctx.pctl(
      "concentration",
      (τ) => {
        const r = ret(qqqSpy, τ, 126);
        return r !== null ? Math.abs(r) : null;
      },
      t
    );
    const concNow = ret(qqqSpy, t, 126);
    const concentration =
      concP !== null
        ? sig(
            "concentration",
            "Concentration risk",
            -toScore(concP),
            concNow !== null
              ? `Mega-cap complex ${pct(concNow, 1, true)} vs the broad tape over 6 months — ${ordinal(concP)} percentile divergence.`
              : "Index concentration divergence."
          )
        : null;

    // Cohesion: do the parts confirm the whole, in the direction of travel?
    let cohesion = null;
    const spyRets = dailyReturns(ctx.s("SPY"), t, 21);
    const r21 = ret(ctx.s("SPY"), t, 21);
    if (spyRets && r21 !== null) {
      const sectorRets: number[][] = [];
      for (const s of SECTORS) {
        if (!ctx.has(s.symbol)) continue;
        const r = dailyReturns(ctx.s(s.symbol), t, 21);
        if (r) sectorRets.push(r);
      }
      const fracs: number[] = [];
      for (let d = 0; d < spyRets.length; d++) {
        let agree = 0;
        for (const r of sectorRets) {
          if (Math.sign(r[d]) === Math.sign(spyRets[d])) agree++;
        }
        if (sectorRets.length >= 8) fracs.push(agree / sectorRets.length);
      }
      const c = mean(fracs);
      if (c !== null) {
        const cohesionStrength = toScore(2 * (c - 0.5)); // 0.5 random → 0
        const score = cohesionStrength * Math.sign(r21);
        cohesion = sig(
          "cohesion",
          "Directional cohesion",
          score,
          `${pct(c, 0)} of sectors confirm the index day-to-day, and the month's drift is ${r21 >= 0 ? "up" : "down"} — ${
            score >= 0 ? "a unified tape" : "unified to the downside"
          }.`
        );
      }
    }

    return [correlation, corrShift, dispersion, concentration, cohesion];
  },

  summarize(score) {
    return band(
      score,
      "Internals are clean: differentiated, cohesive, and unconcentrated.",
      "Market structure is sound with minor blemishes.",
      "Internals are unremarkable — neither confirming nor warning.",
      "Internal quality is degrading: correlation and concentration rising.",
      "The market is trading as one fragile block — structure is broken."
    );
  },
};
