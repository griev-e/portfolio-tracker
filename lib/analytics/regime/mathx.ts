/**
 * Backward-looking series math for the regime engine. Every function only
 * reads indexes ≤ t, so the engine can replay history without lookahead.
 * Series are aligned to a master date axis; null = no data at that date.
 */

export type Series = (number | null)[];

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export function at(s: Series, t: number): number | null {
  if (t < 0 || t >= s.length) return null;
  const v = s[t];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  let ss = 0;
  for (const x of xs) ss += (x - m) * (x - m);
  return Math.sqrt(ss / (xs.length - 1));
}

/** Simple return over n sessions ending at t. */
export function ret(s: Series, t: number, n: number): number | null {
  const a = at(s, t);
  const b = at(s, t - n);
  if (a === null || b === null || b === 0) return null;
  return a / b - 1;
}

export function sma(s: Series, t: number, n: number): number | null {
  if (t - n + 1 < 0) return null;
  let sum = 0;
  for (let i = t - n + 1; i <= t; i++) {
    const v = at(s, i);
    if (v === null) return null;
    sum += v;
  }
  return sum / n;
}

/** n daily returns ending at t (needs n+1 closes). */
export function dailyReturns(s: Series, t: number, n: number): number[] | null {
  if (t - n < 0) return null;
  const out: number[] = [];
  for (let i = t - n + 1; i <= t; i++) {
    const a = at(s, i);
    const b = at(s, i - 1);
    if (a === null || b === null || b === 0) return null;
    out.push(a / b - 1);
  }
  return out;
}

/** Annualized realized volatility over n sessions ending at t. */
export function realizedVol(s: Series, t: number, n: number): number | null {
  const rets = dailyReturns(s, t, n);
  if (!rets) return null;
  const sd = stdev(rets);
  return sd === null ? null : sd * Math.sqrt(252);
}

/** OLS on log-price over n sessions: annualized slope + fit quality. */
export function logSlope(
  s: Series,
  t: number,
  n: number
): { slope: number; r2: number } | null {
  if (t - n + 1 < 0) return null;
  const ys: number[] = [];
  for (let i = t - n + 1; i <= t; i++) {
    const v = at(s, i);
    if (v === null || v <= 0) return null;
    ys.push(Math.log(v));
  }
  const m = ys.length;
  const xMean = (m - 1) / 2;
  const yMean = mean(ys)!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < m; i++) {
    const dx = i - xMean;
    const dy = ys[i] - yMean;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  const slopePerDay = sxy / sxx;
  return {
    slope: Math.expm1(slopePerDay * 252),
    r2: (sxy * sxy) / (sxx * syy),
  };
}

/** Rank of v inside history, 0…1 (ties count half). */
export function percentileRank(history: number[], v: number): number {
  if (history.length === 0) return 0.5;
  let below = 0;
  let equal = 0;
  for (const h of history) {
    if (h < v) below++;
    else if (h === v) equal++;
  }
  return (below + equal / 2) / history.length;
}

export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ma = mean(a.slice(0, n))!;
  const mb = mean(b.slice(0, n))!;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  if (saa === 0 || sbb === 0) return null;
  return sab / Math.sqrt(saa * sbb);
}

/** Spearman rank correlation. */
export function spearman(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;
  return pearson(rankify(a), rankify(b));
}

function rankify(xs: number[]): number[] {
  const idx = xs.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
  const ranks = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const r = (i + j) / 2;
    for (let k = i; k <= j; k++) ranks[idx[k].i] = r;
    i = j + 1;
  }
  return ranks;
}

/** Map a 0…1 percentile/proportion to a -1…+1 score. */
export const toScore = (p: number): number => clamp(2 * p - 1, -1, 1);

/** Significance-weighted mean + dispersion of scores in [-1, 1]. */
export function weightedScore(
  scores: number[],
  weights: number[]
): { score: number; dispersion: number } | null {
  if (scores.length === 0) return null;
  let sw = 0;
  let swx = 0;
  for (let i = 0; i < scores.length; i++) {
    sw += weights[i];
    swx += weights[i] * scores[i];
  }
  if (sw === 0) return null;
  const mu = swx / sw;
  let swd = 0;
  for (let i = 0; i < scores.length; i++) {
    swd += weights[i] * (scores[i] - mu) * (scores[i] - mu);
  }
  return { score: mu, dispersion: Math.sqrt(swd / sw) };
}
