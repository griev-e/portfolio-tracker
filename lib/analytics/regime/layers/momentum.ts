import { mean, ret, toScore } from "../mathx";
import { INDICES, SECTORS } from "../universe";
import { band, ordinal, pct, sig, type LayerSpec } from "./spec";

/**
 * Momentum layer: directional force. Multi-horizon rate of change, whether
 * it's accelerating, and how widely it's shared across risk assets.
 */
export const momentumLayer: LayerSpec = {
  id: "momentum",
  name: "Momentum",
  question: "Is momentum strengthening or fading?",

  compute(ctx, t) {
    // Multi-horizon ROC, each ranked against its own history.
    const horizons: [number, string][] = [
      [21, "1m"],
      [63, "3m"],
      [126, "6m"],
    ];
    const rocScores: number[] = [];
    const rocBits: string[] = [];
    for (const [n, lbl] of horizons) {
      const p = ctx.pctl(`roc:${n}`, (τ) => ret(ctx.s("SPY"), τ, n), t);
      const r = ret(ctx.s("SPY"), t, n);
      if (p === null || r === null) continue;
      rocScores.push(toScore(p));
      rocBits.push(`${lbl} ${pct(r, 1, true)}`);
    }
    const rocAvg = mean(rocScores);
    const roc =
      rocAvg !== null && rocScores.length >= 2
        ? sig(
            "roc",
            "Rate of change",
            rocAvg,
            `S&P ${rocBits.join(", ")} — blended ${ordinal((rocAvg + 1) / 2)} percentile force.`
          )
        : null;

    // Acceleration: this month's impulse vs last month's.
    const accP = ctx.pctl(
      "acceleration",
      (τ) => {
        const a = ret(ctx.s("SPY"), τ, 21);
        const b = ret(ctx.s("SPY"), τ - 21, 21);
        return a !== null && b !== null ? a - b : null;
      },
      t
    );
    const aNow = ret(ctx.s("SPY"), t, 21);
    const aThen = ret(ctx.s("SPY"), t - 21, 21);
    const acceleration =
      accP !== null
        ? sig(
            "acceleration",
            "Momentum acceleration",
            toScore(accP),
            aNow !== null && aThen !== null
              ? `Monthly impulse went ${pct(aThen, 1, true)} → ${pct(aNow, 1, true)} — momentum is ${aNow >= aThen ? "building" : "fading"}.`
              : "Impulse change percentile."
          )
        : null;

    // Momentum breadth: how many risk assets carry positive 3m force.
    const riskAssets = [...INDICES, ...SECTORS].map((x) => x.symbol);
    let pos = 0;
    let tot = 0;
    for (const sym of riskAssets) {
      if (!ctx.has(sym)) continue;
      const r = ret(ctx.s(sym), t, 63);
      if (r === null) continue;
      tot++;
      if (r > 0) pos++;
    }
    const momoBreadth =
      tot >= 10
        ? sig(
            "momo-breadth",
            "Momentum breadth",
            toScore(pos / tot),
            `${pos} of ${tot} indices and sectors hold positive 3-month momentum.`
          )
        : null;

    // Classic 12-1: a year of force, skipping the noisy last month.
    const p121 = ctx.pctl(
      "momo-121",
      (τ) => {
        const s = ctx.s("SPY");
        const a = s[τ - 21];
        const b = s[τ - 252];
        return typeof a === "number" && typeof b === "number" && b !== 0
          ? a / b - 1
          : null;
      },
      t
    );
    const spy = ctx.s("SPY");
    const v121 =
      typeof spy[t - 21] === "number" && typeof spy[t - 252] === "number"
        ? (spy[t - 21] as number) / (spy[t - 252] as number) - 1
        : null;
    const m121 =
      p121 !== null
        ? sig(
            "momo-121",
            "12-1 month momentum",
            toScore(p121),
            v121 !== null
              ? `Year-long force (ex last month) is ${pct(v121, 1, true)} — ${ordinal(p121)} percentile.`
              : "12-1 momentum percentile."
          )
        : null;

    // Relative momentum: risk assets vs the safety complex.
    const relScores: number[] = [];
    for (const safe of ["GLD", "TLT"]) {
      if (!ctx.has(safe)) continue;
      const p = ctx.pctl(
        `relmomo:${safe}`,
        (τ) => {
          const a = ret(ctx.s("SPY"), τ, 63);
          const b = ret(ctx.s(safe), τ, 63);
          return a !== null && b !== null ? a - b : null;
        },
        t
      );
      if (p !== null) relScores.push(toScore(p));
    }
    const relAvg = mean(relScores);
    const relMomo =
      relAvg !== null
        ? sig(
            "rel-momo",
            "Momentum vs safety",
            relAvg,
            relAvg >= 0
              ? "Equities out-running gold and treasuries on the quarter."
              : "Safety assets carry more force than equities right now."
          )
        : null;

    return [roc, acceleration, momoBreadth, m121, relMomo];
  },

  summarize(score) {
    return band(
      score,
      "Momentum is strong, accelerating, and widely shared.",
      "Directional force is positive and reasonably broad.",
      "Momentum is unremarkable in either direction.",
      "Momentum is fading across horizons.",
      "Downside force dominates every horizon."
    );
  },
};
