/**
 * Monte Carlo simulation of portfolio value using geometric Brownian motion
 * with monthly steps and optional recurring contributions.
 *
 *   V_{t+1} = V_t · exp((μ − σ²/2)Δt + σ√Δt · Z) + contribution
 *
 * μ comes from the CAPM expected return and σ from the factor-model covariance
 * (see risk.ts). The RNG is seeded so a given portfolio + inputs always
 * produces the same fan — results change when the portfolio does, not on
 * every render.
 */

export interface MonteCarloInputs {
  initialValue: number;
  mu: number; // annualized drift
  sigma: number; // annualized volatility
  years: number;
  monthlyContribution: number;
  targetValue: number;
  paths?: number;
  /**
   * Optional salt mixed into the seed. The sim is deterministic per portfolio +
   * inputs; bumping this redraws a fresh-but-still-reproducible set of paths
   * (the "refresh simulation" control).
   */
  seedSalt?: number;
}

export interface MonteCarloResult {
  /** Percentile bands per month: [p5, p25, p50, p75, p95]. */
  bands: { month: number; p5: number; p25: number; p50: number; p75: number; p95: number }[];
  /** Probability the target is reached at the horizon. */
  probTargetAtHorizon: number;
  /**
   * Monte Carlo standard error on `probTargetAtHorizon` — √(p(1−p)/N). The
   * binomial SE is mildly conservative under antithetic sampling (true variance
   * is lower), but it gives the UI an honest ± on the headline probability so a
   * 41% read isn't shown as more precise than the path count supports.
   */
  probTargetStdErr: number;
  /** Probability the target is reached at any point during the horizon. */
  probTargetEver: number;
  median: number;
  p5: number;
  p95: number;
  /** Median money-weighted (IRR) return on the contribution stream, annualized. */
  medianCagr: number;
  /** Terminal value histogram. */
  histogram: { x0: number; x1: number; count: number }[];
  totalContributed: number;
  samplePaths: number[][]; // a handful of full paths for the backdrop
}

/** Deterministic RNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runMonteCarlo(inputs: MonteCarloInputs): MonteCarloResult {
  const {
    initialValue,
    mu,
    sigma,
    years,
    monthlyContribution,
    targetValue,
  } = inputs;
  const paths = inputs.paths ?? 3000;
  const months = Math.max(1, Math.round(years * 12));
  const dt = 1 / 12;
  const drift = (mu - (sigma * sigma) / 2) * dt;
  const diffusion = sigma * Math.sqrt(dt);

  const seed =
    Math.round(initialValue) ^
    (months << 8) ^
    Math.round(monthlyContribution * 7) ^
    Math.round(mu * 10000) ^
    Math.round(sigma * 10000) ^
    Math.imul((inputs.seedSalt ?? 0) | 0, 0x9e3779b1);
  const rand = rng(seed || 42);

  // Box-Muller pairs.
  let spare: number | null = null;
  const normal = (): number => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };

  // Keep only the cross-sections we actually read percentiles off (every month
  // ≤10y, quarterly beyond) instead of the full months×paths matrix — bounds
  // memory on long horizons. The per-path running value still drives the target
  // hit-detection, so no information is lost.
  const step = months > 120 ? 3 : 1;
  const sampledMonths: number[] = [];
  for (let m = 0; m <= months; m += step) sampledMonths.push(m);
  if (sampledMonths[sampledMonths.length - 1] !== months) sampledMonths.push(months);

  const colOf = new Int32Array(months + 1).fill(-1);
  sampledMonths.forEach((m, ci) => {
    colOf[m] = ci;
  });
  const cols: Float64Array[] = sampledMonths.map(() => new Float64Array(paths));
  cols[colOf[0]].fill(initialValue);
  const terminalCol = cols[colOf[months]];

  let everHit = 0;
  const sampleIdx = new Set<number>();
  const sampleCount = Math.min(28, paths);
  for (let i = 0; i < sampleCount; i++) {
    sampleIdx.add(Math.floor((i / sampleCount) * paths));
  }
  const samplePaths: number[][] = [];
  const sampleMap = new Map<number, number[]>();
  for (const idx of sampleIdx) {
    const arr = [initialValue];
    sampleMap.set(idx, arr);
    samplePaths.push(arr);
  }

  const record = (p: number, m: number, v: number, sample: number[] | undefined) => {
    const ci = colOf[m];
    if (ci >= 0) cols[ci][p] = v;
    sample?.push(v);
  };

  // Antithetic variates: paths are drawn in mirror pairs that share the same
  // shocks with opposite sign, cancelling much of the sampling noise in the
  // mean/percentile estimates at no extra draws. Still fully deterministic per
  // seed, so a given portfolio yields a reproducible fan.
  for (let p = 0; p < paths; p += 2) {
    const hasPair = p + 1 < paths;
    let v0 = initialValue;
    let v1 = initialValue;
    let hit0 = false;
    let hit1 = false;
    const sample0 = sampleMap.get(p);
    const sample1 = hasPair ? sampleMap.get(p + 1) : undefined;
    for (let m = 1; m <= months; m++) {
      const z = normal();
      v0 = v0 * Math.exp(drift + diffusion * z) + monthlyContribution;
      record(p, m, v0, sample0);
      if (!hit0 && targetValue > 0 && v0 >= targetValue) {
        hit0 = true;
        everHit++;
      }
      if (hasPair) {
        v1 = v1 * Math.exp(drift - diffusion * z) + monthlyContribution;
        record(p + 1, m, v1, sample1);
        if (!hit1 && targetValue > 0 && v1 >= targetValue) {
          hit1 = true;
          everHit++;
        }
      }
    }
  }

  // Sort a cross-section once, then read every percentile off it.
  const sortedPct = (arr: Float64Array) => {
    const sorted = Float64Array.from(arr).sort();
    const at = (q: number) =>
      sorted[
        Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))
      ];
    return at;
  };
  const bands: MonteCarloResult["bands"] = sampledMonths.map((m) => {
    const at = sortedPct(cols[colOf[m]]);
    return { month: m, p5: at(0.05), p25: at(0.25), p50: at(0.5), p75: at(0.75), p95: at(0.95) };
  });

  const terminal = terminalCol;
  const hitAtHorizon =
    targetValue > 0
      ? terminal.reduce((s, v) => s + (v >= targetValue ? 1 : 0), 0)
      : 0;

  const totalContributed = initialValue + monthlyContribution * months;
  const terminalAt = sortedPct(terminal);
  const median = terminalAt(0.5);
  // Money-weighted (IRR) return: each monthly contribution is invested for only
  // the months that remain, so a simple (terminal / totalContributed) lump-sum
  // CAGR understates the true rate. Solve for the rate that grows the actual
  // cash-flow stream into the median terminal.
  const medianCagr = moneyWeightedCagr(
    initialValue,
    monthlyContribution,
    months,
    median
  );

  // Terminal distribution histogram (clipped at p99 so the tail doesn't flatten it).
  const lo = terminalAt(0.001);
  const hi = terminalAt(0.99);
  const BINS = 36;
  const width = (hi - lo) / BINS || 1;
  const histogram = Array.from({ length: BINS }, (_, i) => ({
    x0: lo + i * width,
    x1: lo + (i + 1) * width,
    count: 0,
  }));
  for (const v of terminal) {
    const b = Math.min(BINS - 1, Math.max(0, Math.floor((v - lo) / width)));
    histogram[b].count++;
  }

  const probAtHorizon = targetValue > 0 ? hitAtHorizon / paths : 0;

  return {
    bands,
    probTargetAtHorizon: probAtHorizon,
    probTargetStdErr:
      targetValue > 0 ? Math.sqrt((probAtHorizon * (1 - probAtHorizon)) / paths) : 0,
    probTargetEver: targetValue > 0 ? everHit / paths : 0,
    median,
    p5: terminalAt(0.05),
    p95: terminalAt(0.95),
    medianCagr,
    histogram,
    totalContributed,
    samplePaths,
  };
}

/**
 * Annualized money-weighted (IRR) return for the sim's cash-flow shape: an
 * initial `v0`, then a contribution `c` at the end of each of `months` months
 * (so contribution m compounds for `months − m` months), growing into `terminal`.
 *
 * The monthly rate i solves
 *   v0·(1+i)^months + c·((1+i)^months − 1)/i = terminal
 * whose left side is monotonically increasing in i, so a bisection pins it. The
 * rate is then annualized as (1+i)^12 − 1. With c = 0 this reduces to the plain
 * lump-sum CAGR (terminal / v0)^(1/years) − 1.
 */
function moneyWeightedCagr(
  v0: number,
  c: number,
  months: number,
  terminal: number
): number {
  if (months <= 0 || terminal <= 0 || (v0 <= 0 && c <= 0)) return 0;

  // Future value of the cash-flow stream at a monthly rate i.
  const fv = (i: number): number => {
    if (Math.abs(i) < 1e-12) return v0 + c * months; // i → 0 limit of the annuity factor
    const growth = Math.pow(1 + i, months);
    return v0 * growth + c * ((growth - 1) / i);
  };

  // f(i) = fv(i) − terminal is increasing in i; bracket then bisect.
  let lo = -0.9999; // ≈ total loss each month
  let hi = 10; // 1000%/month — comfortably above any plausible IRR
  if (fv(lo) > terminal) return Math.pow(1 + lo, 12) - 1;
  if (fv(hi) < terminal) return Math.pow(1 + hi, 12) - 1;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    if (fv(mid) < terminal) lo = mid;
    else hi = mid;
  }
  const monthly = (lo + hi) / 2;
  return Math.pow(1 + monthly, 12) - 1;
}
