import { at, logSlope, ret, sma, toScore } from "../mathx";
import { SECTORS } from "../universe";
import { band, ordinal, pct, ratioSeries, sig, type LayerSpec } from "./spec";

/** Share of sectors above their n-day average at session t. */
function pctAbove(
  ctx: Parameters<LayerSpec["compute"]>[0],
  t: number,
  n: number
): number | null {
  let above = 0;
  let total = 0;
  for (const s of SECTORS) {
    if (!ctx.has(s.symbol)) continue;
    const p = at(ctx.s(s.symbol), t);
    const m = sma(ctx.s(s.symbol), t, n);
    if (p === null || m === null) continue;
    total++;
    if (p > m) above++;
  }
  return total >= 8 ? above / total : null;
}

/**
 * Breadth layer: is the move carried by the whole market or a handful of
 * names? Participation across sectors, the equal-weight tape, and the
 * direction breadth itself is moving.
 */
export const breadthLayer: LayerSpec = {
  id: "breadth",
  name: "Breadth",
  question: "Is participation broad or narrow?",

  compute(ctx, t) {
    const sectors = SECTORS.filter((s) => ctx.has(s.symbol));

    const p200 = pctAbove(ctx, t, 200);
    const above200 =
      p200 !== null
        ? sig(
            "above-200",
            "Sectors above 200-day",
            toScore(p200),
            `${Math.round(p200 * sectors.length)} of ${sectors.length} sectors trade above their 200-day average.`
          )
        : null;

    const p50 = pctAbove(ctx, t, 50);
    const above50 =
      p50 !== null
        ? sig(
            "above-50",
            "Sectors above 50-day",
            toScore(p50),
            `${Math.round(p50 * sectors.length)} of ${sectors.length} sectors trade above their 50-day average.`
          )
        : null;

    // Equal-weight vs cap-weight: the purest "average stock" read.
    const ew = ratioSeries(ctx, "RSP", "SPY");
    const ewP = ctx.pctl(
      "ew-slope",
      (τ) => logSlope(ew, τ, 63)?.slope ?? null,
      t
    );
    const ewSlope = logSlope(ew, t, 63)?.slope ?? null;
    const equalWeight =
      ewP !== null
        ? sig(
            "equal-weight",
            "Equal-weight vs cap-weight",
            toScore(ewP),
            ewSlope !== null
              ? `RSP/SPY trend ${pct(ewSlope, 0, true)}/yr — ${ordinal(ewP)} percentile. ${ewSlope > 0 ? "The average stock is keeping up." : "Gains concentrate in the biggest names."}`
              : "Equal-weight relative trend percentile."
          )
        : null;

    // Breadth thrust: is participation expanding or contracting?
    const thrustP = ctx.pctl(
      "breadth-delta",
      (τ) => {
        const now = pctAbove(ctx, τ, 50);
        const then = pctAbove(ctx, τ - 21, 50);
        return now !== null && then !== null ? now - then : null;
      },
      t
    );
    const dNow = pctAbove(ctx, t, 50);
    const dThen = pctAbove(ctx, t - 21, 50);
    const thrust =
      thrustP !== null
        ? sig(
            "thrust",
            "Breadth expansion",
            toScore(thrustP),
            dNow !== null && dThen !== null
              ? `Participation moved ${pct(dNow - dThen, 0, true)} pts over the last month (${pct(dThen, 0)} → ${pct(dNow, 0)} above 50-day).`
              : "Month-over-month participation change percentile."
          )
        : null;

    // Plain positivity: how many sectors are actually up on the quarter.
    let pos = 0;
    let tot = 0;
    for (const s of sectors) {
      const r = ret(ctx.s(s.symbol), t, 63);
      if (r === null) continue;
      tot++;
      if (r > 0) pos++;
    }
    const positivity =
      tot >= 8
        ? sig(
            "positivity",
            "Sectors positive on quarter",
            toScore(pos / tot),
            `${pos} of ${tot} sectors carry a positive 3-month return.`
          )
        : null;

    return [above200, above50, equalWeight, thrust, positivity];
  },

  summarize(score) {
    return band(
      score,
      "Participation is broad — the whole market is carrying the move.",
      "Most of the market participates, with some soft spots.",
      "Participation is split — neither broad strength nor broad damage.",
      "Participation is narrowing; fewer groups hold the tape up.",
      "Breadth has collapsed — weakness is broad and deep."
    );
  },
};
