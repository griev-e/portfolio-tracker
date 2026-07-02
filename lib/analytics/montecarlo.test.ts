import { describe, expect, it } from "vitest";
import { type MonteCarloInputs, runMonteCarlo } from "./montecarlo";

const baseInputs: MonteCarloInputs = {
  initialValue: 100_000,
  mu: 0.08,
  sigma: 0.18,
  years: 10,
  monthlyContribution: 500,
  targetValue: 400_000,
  paths: 2000,
};

describe("runMonteCarlo", () => {
  it("is deterministic for identical inputs", () => {
    const a = runMonteCarlo(baseInputs);
    const b = runMonteCarlo(baseInputs);
    expect(b.median).toBe(a.median);
    expect(b.p5).toBe(a.p5);
    expect(b.p95).toBe(a.p95);
    expect(b.probTargetAtHorizon).toBe(a.probTargetAtHorizon);
  });

  it("keeps percentile bands ordered within every month", () => {
    const { bands } = runMonteCarlo(baseInputs);
    for (const b of bands) {
      expect(b.p5).toBeLessThanOrEqual(b.p25);
      expect(b.p25).toBeLessThanOrEqual(b.p50);
      expect(b.p50).toBeLessThanOrEqual(b.p75);
      expect(b.p75).toBeLessThanOrEqual(b.p95);
    }
  });

  it("anchors month 0 to the initial value", () => {
    const { bands } = runMonteCarlo(baseInputs);
    expect(bands[0].month).toBe(0);
    expect(bands[0].p5).toBe(baseInputs.initialValue);
    expect(bands[0].p95).toBe(baseInputs.initialValue);
  });

  it("bounds probabilities and never undercounts ever-touched vs at-horizon", () => {
    const r = runMonteCarlo(baseInputs);
    for (const p of [r.probTargetAtHorizon, r.probTargetEver]) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(r.probTargetEver).toBeGreaterThanOrEqual(r.probTargetAtHorizon);
  });

  it("reports no target probability when there is no target", () => {
    const r = runMonteCarlo({ ...baseInputs, targetValue: 0 });
    expect(r.probTargetAtHorizon).toBe(0);
    expect(r.probTargetEver).toBe(0);
  });

  it("accounts for every path in the terminal histogram", () => {
    const paths = 1500;
    const r = runMonteCarlo({ ...baseInputs, paths });
    const counted = r.histogram.reduce((s, bin) => s + bin.count, 0);
    expect(counted).toBe(paths);
  });

  it("tracks total contributions exactly", () => {
    const r = runMonteCarlo(baseInputs);
    const months = baseInputs.years * 12;
    expect(r.totalContributed).toBe(
      baseInputs.initialValue + baseInputs.monthlyContribution * months
    );
  });

  it("reports median CAGR as a lump-sum rate when there are no contributions", () => {
    const r = runMonteCarlo({ ...baseInputs, monthlyContribution: 0 });
    const lumpSum = Math.pow(r.median / baseInputs.initialValue, 1 / baseInputs.years) - 1;
    expect(r.medianCagr).toBeCloseTo(lumpSum, 10);
  });

  it("money-weights the median CAGR above the naive lump-sum rate", () => {
    const r = runMonteCarlo(baseInputs);
    // The old method divided by every contributed dollar as if invested at t=0,
    // understating the rate. A money-weighted (IRR) read sits strictly above it.
    const naive = Math.pow(r.median / r.totalContributed, 1 / baseInputs.years) - 1;
    expect(r.medianCagr).toBeGreaterThan(naive);
  });

  it("reports a binomial standard error on the horizon probability", () => {
    const r = runMonteCarlo(baseInputs);
    const n = baseInputs.paths ?? 3000;
    const expected = Math.sqrt(
      (r.probTargetAtHorizon * (1 - r.probTargetAtHorizon)) / n
    );
    expect(r.probTargetStdErr).toBeCloseTo(expected, 12);
  });

  it("reports zero probability standard error when there is no target", () => {
    const r = runMonteCarlo({ ...baseInputs, targetValue: 0 });
    expect(r.probTargetStdErr).toBe(0);
  });

  // Isolate the distributional shape: no contributions, no target.
  const iso: MonteCarloInputs = {
    ...baseInputs,
    monthlyContribution: 0,
    targetValue: 0,
    paths: 4000,
  };

  it("leaves output unchanged when the honesty knobs are at their defaults", () => {
    // muStdErr=0 and shockDof undefined must reduce exactly to classic GBM, so
    // opting out is byte-for-byte identical.
    const base = runMonteCarlo(iso);
    const explicit = runMonteCarlo({ ...iso, muStdErr: 0, shockDof: 0 });
    expect(explicit.median).toBe(base.median);
    expect(explicit.p5).toBe(base.p5);
    expect(explicit.p95).toBe(base.p95);
  });

  it("drift uncertainty widens the terminal spread", () => {
    const base = runMonteCarlo(iso);
    const uncertain = runMonteCarlo({ ...iso, muStdErr: 0.03 });
    expect(uncertain.p95 - uncertain.p5).toBeGreaterThan(base.p95 - base.p5);
  });

  it("fat tails deepen the downside (drawdown realism) while keeping the centre", () => {
    const gauss = runMonteCarlo(iso);
    const fat = runMonteCarlo({ ...iso, shockDof: 5 });
    // The Student-t scale mixture is leptokurtic: the body (p5–p95) is more
    // peaked, but the extreme left tail is heavier — the whole point, so a
    // goal-planner stops understating how bad bad can get. The histogram's lower
    // bound tracks p0.1, which sits lower with fat tails.
    expect(fat.histogram[0].x0).toBeLessThan(gauss.histogram[0].x0);
    // Average variance is preserved, so the median barely moves.
    expect(Math.abs(fat.median - gauss.median) / gauss.median).toBeLessThan(0.1);
  });

  it("ignores a degrees-of-freedom ≤ 2 (undefined variance) as plain Gaussian", () => {
    const gauss = runMonteCarlo(iso);
    const bad = runMonteCarlo({ ...iso, shockDof: 2 });
    expect(bad.median).toBe(gauss.median);
    expect(bad.p95).toBe(gauss.p95);
  });

  it("stays deterministic with the honesty knobs engaged", () => {
    const a = runMonteCarlo({ ...iso, muStdErr: 0.02, shockDof: 5 });
    const b = runMonteCarlo({ ...iso, muStdErr: 0.02, shockDof: 5 });
    expect(a.p5).toBe(b.p5);
    expect(a.p95).toBe(b.p95);
    expect(a.median).toBe(b.median);
  });

  it("reduces to deterministic compounding when volatility is zero", () => {
    const r = runMonteCarlo({
      ...baseInputs,
      sigma: 0,
      monthlyContribution: 0,
      targetValue: 0,
    });
    const expected = baseInputs.initialValue * Math.exp(baseInputs.mu * baseInputs.years);
    // Every path is identical, so all percentiles collapse onto the same value.
    expect(r.median).toBeCloseTo(expected, 0);
    expect(r.p5).toBeCloseTo(expected, 0);
    expect(r.p95).toBeCloseTo(expected, 0);
  });
});

describe("tail-risk metrics", () => {
  it("reports CVaR95 at or below the p5 terminal", () => {
    const r = runMonteCarlo(baseInputs);
    // Expected shortfall averages the tail *below* p5, so it can't exceed it.
    expect(r.cvar95).toBeLessThanOrEqual(r.p5);
    expect(r.cvar95).toBeGreaterThan(0);
  });

  it("orders drawdown percentiles and bounds them in [0, 1)", () => {
    const r = runMonteCarlo(baseInputs);
    expect(r.maxDrawdown.median).toBeGreaterThan(0);
    expect(r.maxDrawdown.p90).toBeGreaterThanOrEqual(r.maxDrawdown.median);
    expect(r.maxDrawdown.p90).toBeLessThan(1);
  });

  it("reports zero drawdown when volatility is zero and drift is positive", () => {
    const r = runMonteCarlo({ ...baseInputs, sigma: 0, targetValue: 0 });
    expect(r.maxDrawdown.median).toBe(0);
    expect(r.maxDrawdown.p90).toBe(0);
  });
});
