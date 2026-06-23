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
  /** Probability the target is reached at any point during the horizon. */
  probTargetEver: number;
  median: number;
  p5: number;
  p95: number;
  /** Median CAGR on contributions-adjusted growth (money-weighted approximation). */
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

  // values[m] holds every path's value at month m (column-major for percentiles).
  const values: Float64Array[] = Array.from(
    { length: months + 1 },
    () => new Float64Array(paths)
  );
  values[0].fill(initialValue);

  let everHit = 0;
  const hitFlags = new Uint8Array(paths);
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

  for (let p = 0; p < paths; p++) {
    let v = initialValue;
    const sample = sampleMap.get(p); // hoisted: avoid a Map lookup per month
    for (let m = 1; m <= months; m++) {
      v = v * Math.exp(drift + diffusion * normal()) + monthlyContribution;
      values[m][p] = v;
      if (!hitFlags[p] && targetValue > 0 && v >= targetValue) {
        hitFlags[p] = 1;
        everHit++;
      }
      sample?.push(v);
    }
  }

  // Sort each month's cross-section once, then read all percentiles off it.
  const sortedPct = (arr: Float64Array) => {
    const sorted = Float64Array.from(arr).sort();
    const at = (q: number) =>
      sorted[
        Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))
      ];
    return at;
  };
  const bandAt = (m: number): MonteCarloResult["bands"][number] => {
    const at = sortedPct(values[m]);
    return { month: m, p5: at(0.05), p25: at(0.25), p50: at(0.5), p75: at(0.75), p95: at(0.95) };
  };

  // Sample every month up to 10y horizons, quarterly beyond, to keep the chart light.
  const step = months > 120 ? 3 : 1;
  const bands: MonteCarloResult["bands"] = [];
  for (let m = 0; m <= months; m += step) {
    bands.push(bandAt(m));
  }
  if (bands[bands.length - 1].month !== months) {
    bands.push(bandAt(months));
  }

  const terminal = values[months];
  const hitAtHorizon =
    targetValue > 0
      ? terminal.reduce((s, v) => s + (v >= targetValue ? 1 : 0), 0)
      : 0;

  const totalContributed = initialValue + monthlyContribution * months;
  const terminalAt = sortedPct(terminal);
  const median = terminalAt(0.5);
  const medianCagr =
    totalContributed > 0 && years > 0
      ? Math.pow(median / totalContributed, 1 / years) - 1
      : 0;

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

  return {
    bands,
    probTargetAtHorizon: targetValue > 0 ? hitAtHorizon / paths : 0,
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
