import { logSlope, toScore } from "../mathx";
import { PAIRS } from "../universe";
import { band, ordinal, pct, ratioSeries, sig, type LayerSpec } from "./spec";

/**
 * Relative-strength layer: where is capital actually flowing? Each pair is a
 * risk-seeking leg over a safety-seeking leg; a rising ratio means the risk
 * leg is being accumulated. Scored against each ratio's own trend history.
 */
export const relStrengthLayer: LayerSpec = {
  id: "relstrength",
  name: "Relative Strength",
  question: "Is capital seeking risk or safety?",

  compute(ctx, t) {
    return PAIRS.map((pair) => {
      if (!ctx.has(pair.a) || !ctx.has(pair.b)) return null;
      const series = ratioSeries(ctx, pair.a, pair.b);
      const p = ctx.pctl(
        `pair-slope:${pair.id}`,
        (τ) => logSlope(series, τ, 63)?.slope ?? null,
        t
      );
      if (p === null) return null;
      const slope = logSlope(series, t, 63)?.slope ?? null;
      return sig(
        pair.id,
        pair.label,
        toScore(p),
        slope !== null
          ? `${pair.a}/${pair.b} trending ${pct(slope, 0, true)}/yr — ${ordinal(p)} percentile (${pair.lens}).`
          : `${pair.a}/${pair.b} trend percentile (${pair.lens}).`
      );
    });
  },

  summarize(score) {
    return band(
      score,
      "Capital is decisively embracing risk across asset pairs.",
      "Flows lean risk-seeking — offense is being accumulated.",
      "Flows are balanced between risk and safety.",
      "Capital is rotating toward safety.",
      "Flight to safety — defensive assets are being accumulated everywhere."
    );
  },
};
