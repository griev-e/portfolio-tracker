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
