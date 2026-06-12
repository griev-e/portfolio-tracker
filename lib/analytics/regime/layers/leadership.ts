import { mean, ret, spearman, toScore } from "../mathx";
import { POSTURE_SCORE, SECTORS } from "../universe";
import { band, ordinal, sig, type LayerSpec } from "./spec";

interface Ranked {
  symbol: string;
  label: string;
  posture: number;
  rel: number;
}

/** Sectors ranked by 3-month return relative to SPY (best first). */
function rankSectors(
  ctx: Parameters<LayerSpec["compute"]>[0],
  t: number
): Ranked[] | null {
  const spy = ret(ctx.s("SPY"), t, 63);
  if (spy === null) return null;
  const rows: Ranked[] = [];
  for (const s of SECTORS) {
    if (!ctx.has(s.symbol)) continue;
    const r = ret(ctx.s(s.symbol), t, 63);
    if (r === null) continue;
    rows.push({
      symbol: s.symbol,
      label: s.label,
      posture: POSTURE_SCORE[s.posture],
      rel: r - spy,
    });
  }
  if (rows.length < 8) return null;
  return rows.sort((a, b) => b.rel - a.rel);
}

/**
 * Leadership layer: who is actually leading, is that leadership historically
 * risk-on or defensive, and is it stable or churning?
 */
export const leadershipLayer: LayerSpec = {
  id: "leadership",
  name: "Leadership",
  question: "Is market leadership healthy?",

  compute(ctx, t) {
    const now = rankSectors(ctx, t);
    const prev = rankSectors(ctx, t - 21);
    if (!now) return [null, null, null, null, null];

    const top = now.slice(0, 3);
    const bottom = now.slice(-3);

    const leaderPosture = sig(
      "leader-posture",
      "Character of leaders",
      mean(top.map((s) => s.posture)) ?? 0,
      `Leading on the quarter: ${top.map((s) => s.label).join(", ")}.`
    );

    const laggardPosture = sig(
      "laggard-posture",
      "Character of laggards",
      -(mean(bottom.map((s) => s.posture)) ?? 0),
      `Lagging on the quarter: ${bottom.map((s) => s.label).join(", ")}. ${
        (mean(bottom.map((s) => s.posture)) ?? 0) < 0
          ? "Defensives lagging is what risk appetite looks like."
          : "Offensive groups at the bottom is a defensive tell."
      }`
    );

    // Persistence: do this month's ranks look like last month's?
    let persistence = null;
    let rotation = null;
    if (prev) {
      const common = now.filter((n) => prev.some((p) => p.symbol === n.symbol));
      const a = common.map((n) => n.rel);
      const b = common.map(
        (n) => prev.find((p) => p.symbol === n.symbol)!.rel
      );
      const rho = spearman(a, b);
      if (rho !== null) {
        persistence = sig(
          "persistence",
          "Leadership persistence",
          rho,
          `Sector rankings show ρ ${rho.toFixed(2)} rank correlation with a month ago (1 = identical order, −1 = fully inverted).`
        );
      }

      // Rotation speed: average places moved in the pecking order.
      const order = (rows: Ranked[]) =>
        new Map(rows.map((r, i) => [r.symbol, i]));
      const oNow = order(now);
      const oPrev = order(prev);
      const moves: number[] = [];
      for (const [sym, i] of oNow) {
        const j = oPrev.get(sym);
        if (j !== undefined) moves.push(Math.abs(i - j));
      }
      const avgMove = mean(moves);
      if (avgMove !== null) {
        const p = ctx.pctl(
          "rotation-speed",
          (τ) => {
            const n2 = rankSectors(ctx, τ);
            const p2 = rankSectors(ctx, τ - 21);
            if (!n2 || !p2) return null;
            const o2 = new Map(p2.map((r, i) => [r.symbol, i]));
            const m: number[] = [];
            n2.forEach((r, i) => {
              const j = o2.get(r.symbol);
              if (j !== undefined) m.push(Math.abs(i - j));
            });
            return mean(m);
          },
          t
        );
        if (p !== null) {
          rotation = sig(
            "rotation",
            "Rotation speed",
            -toScore(p),
            `Sectors moved ${avgMove.toFixed(1)} places on average this month — ${ordinal(p)} percentile churn.`
          );
        }
      }
    }

    // Dominance: is one group towing everything? (gap of #1 over median)
    const medianRel = now[Math.floor(now.length / 2)].rel;
    const gap = now[0].rel - medianRel;
    const gapP = ctx.pctl(
      "leader-gap",
      (τ) => {
        const r = rankSectors(ctx, τ);
        return r ? r[0].rel - r[Math.floor(r.length / 2)].rel : null;
      },
      t
    );
    const dominance =
      gapP !== null
        ? sig(
            "dominance",
            "Leadership breadth",
            -toScore(gapP),
            `${now[0].label} leads the median sector by ${(gap * 100).toFixed(1)}pts — ${ordinal(gapP)} percentile gap${gapP > 0.7 ? " (narrow leadership)" : ""}.`
          )
        : null;

    return [leaderPosture, laggardPosture, persistence, rotation, dominance];
  },

  summarize(score) {
    return band(
      score,
      "Risk-on groups lead decisively, and the leadership is stable.",
      "Leadership tilts offensive and is reasonably orderly.",
      "Leadership is mixed — no clear offensive or defensive tilt.",
      "Defensive groups are taking over leadership.",
      "Classic defensive leadership — capital is hiding, not hunting."
    );
  },
};
