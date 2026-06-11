import type { MarketContext } from "../context";
import { at, clamp, type Series } from "../mathx";
import type { LayerId, SignalResult } from "../types";

/**
 * A layer is an independent lens on the market. It emits scored signals;
 * the engine decides how much each layer matters — layers never weight
 * themselves. Adding a layer = new file implementing this + registering it.
 */
export interface LayerSpec {
  id: LayerId;
  name: string;
  question: string;
  /**
   * Evaluate at session t (reading only data ≤ t). Fixed-length output:
   * null entries mean "not computable today" and count against coverage.
   */
  compute(ctx: MarketContext, t: number): (SignalResult | null)[];
  /** One-line answer to the layer's question, given its blended score. */
  summarize(score: number): string;
}

export function sig(
  id: string,
  label: string,
  score: number,
  detail: string
): SignalResult {
  return { id, label, score: clamp(score, -1, 1), detail };
}

/** Memoized a/b ratio series. */
export function ratioSeries(ctx: MarketContext, a: string, b: string): Series {
  return ctx.indicator(`ratio:${a}/${b}`, (t) => {
    const va = at(ctx.s(a), t);
    const vb = at(ctx.s(b), t);
    return va !== null && vb !== null && vb !== 0 ? va / vb : null;
  });
}

/** Pick a phrase by score band — shared shape for layer summaries. */
export function band(
  score: number,
  strongPos: string,
  pos: string,
  flat: string,
  neg: string,
  strongNeg: string
): string {
  if (score >= 0.45) return strongPos;
  if (score >= 0.15) return pos;
  if (score > -0.15) return flat;
  if (score > -0.45) return neg;
  return strongNeg;
}

export const pct = (v: number, digits = 1, signed = false): string => {
  const s = (v * 100).toFixed(digits);
  return signed && v > 0 ? `+${s}%` : `${s}%`;
};

export const ordinal = (p: number): string => {
  const n = Math.round(p * 100);
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
};
