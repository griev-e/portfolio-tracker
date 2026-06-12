import { at, clamp, realizedVol, ret, toScore } from "../mathx";
import { VOL_SYMBOLS } from "../universe";
import { band, ordinal, pct, ratioSeries, sig, type LayerSpec } from "./spec";

/**
 * Volatility layer: is uncertainty expanding or contracting, and does the
 * volatility complex confirm or contradict what price is doing?
 */
export const volatilityLayer: LayerSpec = {
  id: "volatility",
  name: "Volatility",
  question: "Is volatility supportive or restrictive?",

  compute(ctx, t) {
    const vix = ctx.s(VOL_SYMBOLS.vix);

    // Implied level vs its own year — low and sleepy is supportive.
    const lvlP = ctx.pctl("vix-level", (τ) => at(vix, τ), t);
    const vixNow = at(vix, t);
    const level =
      lvlP !== null && vixNow !== null
        ? sig(
            "vix-level",
            "Implied volatility",
            -toScore(lvlP),
            `VIX ${vixNow.toFixed(1)} — ${ordinal(lvlP)} percentile of the trailing year.`
          )
        : null;

    // Implied trend: which way is fear moving?
    const trendP = ctx.pctl(
      "vix-trend",
      (τ) => {
        const a = at(vix, τ);
        const b = at(vix, τ - 21);
        return a !== null && b !== null && b > 0 ? Math.log(a / b) : null;
      },
      t
    );
    const vThen = at(vix, t - 21);
    const trend =
      trendP !== null
        ? sig(
            "vix-trend",
            "Volatility trend",
            -toScore(trendP),
            vixNow !== null && vThen !== null
              ? `VIX moved ${pct(vixNow / vThen - 1, 0, true)} over the last month (${vThen.toFixed(1)} → ${vixNow.toFixed(1)}).`
              : "Month-over-month implied volatility change."
          )
        : null;

    // Term structure: contango = priced calm; backwardation = present stress.
    let term = null;
    if (ctx.has(VOL_SYMBOLS.vix3m)) {
      const ts = ratioSeries(ctx, VOL_SYMBOLS.vix3m, VOL_SYMBOLS.vix);
      const tsP = ctx.pctl("vix-term", (τ) => at(ts, τ), t);
      const tsNow = at(ts, t);
      if (tsP !== null && tsNow !== null) {
        term = sig(
          "term-structure",
          "Volatility term structure",
          toScore(tsP),
          `VIX3M/VIX at ${tsNow.toFixed(2)} — ${tsNow >= 1 ? "contango (stress deferred)" : "backwardation (stress is now)"}, ${ordinal(tsP)} percentile.`
        );
      }
    }

    // Realized: what the tape is actually doing, not what's priced.
    const rvP = ctx.pctl(
      "realized-vol",
      (τ) => realizedVol(ctx.s("SPY"), τ, 21),
      t
    );
    const rvNow = realizedVol(ctx.s("SPY"), t, 21);
    const realized =
      rvP !== null
        ? sig(
            "realized",
            "Realized volatility",
            -toScore(rvP),
            rvNow !== null
              ? `S&P realized ${pct(rvNow, 0)} annualized over the last month — ${ordinal(rvP)} percentile.`
              : "Realized volatility percentile."
          )
        : null;

    // Confirmation: rising tape on falling vol is the healthy combination.
    let confirm = null;
    const r63 = ret(ctx.s("SPY"), t, 63);
    const rvShort = realizedVol(ctx.s("SPY"), t, 21);
    const rvLong = realizedVol(ctx.s("SPY"), t, 63);
    if (r63 !== null && rvShort !== null && rvLong !== null && rvLong > 0) {
      const priceLeg = clamp(r63 * 12, -1, 1); // ±~8% on the quarter saturates
      const volLeg = clamp((rvLong - rvShort) / rvLong, -1, 1); // + = cooling
      // Cooling vol is supportive, expanding vol restrictive; the tape's
      // direction amplifies or mutes it. Quadrant valence: up+cooling strongly
      // positive, down+expanding strongly negative, the mixed cases mild.
      const score = clamp((volLeg + priceLeg * Math.abs(volLeg)) / 2, -1, 1);
      confirm = sig(
        "vol-confirm",
        "Volatility confirmation",
        score,
        r63 > 0
          ? volLeg > 0
            ? "Rising tape with cooling volatility — strength is being confirmed."
            : "The rally is dragging volatility up with it — uneasy advance."
          : volLeg > 0
            ? "Falling tape but volatility is compressing — stress is draining."
            : "Falling tape with expanding volatility — stress is feeding itself."
      );
    }

    return [level, trend, term, realized, confirm];
  },

  summarize(score) {
    return band(
      score,
      "The volatility complex is calm and confirming — supportive.",
      "Volatility is contained; little stress is being priced.",
      "Volatility is unremarkable — neither tailwind nor warning.",
      "Uncertainty is being repriced higher.",
      "Volatility is expanding sharply — conditions are restrictive."
    );
  },
};
