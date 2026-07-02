import { describe, expect, it } from "vitest";
import { capWeightsOf, impliedExcessReturns } from "./impliedReturns";

const cov = [
  [0.09, 0.02, 0.01],
  [0.02, 0.04, 0.015],
  [0.01, 0.015, 0.0625],
];

describe("capWeightsOf", () => {
  it("normalizes to 1 and preserves proportion", () => {
    const w = capWeightsOf([2e12, 1e12, 1e12])!;
    expect(w.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(w[0]).toBeCloseTo(0.5, 12);
  });

  it("returns null when any cap is missing or non-positive", () => {
    expect(capWeightsOf([1e12, undefined, 1e12])).toBeNull();
    expect(capWeightsOf([1e12, 0, 1e12])).toBeNull();
  });
});

describe("impliedExcessReturns", () => {
  const w = [0.5, 0.3, 0.2];
  const erp = 0.045;
  const marketVar = 0.16 ** 2;

  it("computes π = δ·Σ·w with δ = erp/σ²", () => {
    const pi = impliedExcessReturns(cov, w, erp, marketVar);
    const delta = erp / marketVar;
    for (let i = 0; i < 3; i++) {
      const sw = cov[i].reduce((s, c, j) => s + c * w[j], 0);
      expect(pi[i]).toBeCloseTo(delta * sw, 12);
    }
  });

  it("makes the cap-weighted portfolio a stationary point of μᵀx − (δ/2)xᵀΣx", () => {
    // The defining reverse-optimization property: ∇(πᵀx − (δ/2)xᵀΣx) = 0 at
    // x = w_cap, i.e. π = δΣw exactly. This is what "equilibrium returns" mean.
    const pi = impliedExcessReturns(cov, w, erp, marketVar);
    const delta = erp / marketVar;
    for (let i = 0; i < 3; i++) {
      const sw = cov[i].reduce((s, c, j) => s + c * w[j], 0);
      expect(pi[i] - delta * sw).toBeCloseTo(0, 12);
    }
  });

  it("rewards covariance with the market, not just own variance", () => {
    // Asset 2 has higher own variance (0.0625 > 0.04) but lower covariance
    // with the cap-weighted portfolio than asset 0 — its implied premium must
    // be lower. A pure-β/variance ranking would get this wrong.
    const pi = impliedExcessReturns(cov, w, erp, marketVar);
    expect(pi[0]).toBeGreaterThan(pi[2]);
  });

  it("degrades to zero premium when market variance is zero", () => {
    const pi = impliedExcessReturns(cov, w, erp, 0);
    expect(pi).toEqual([0, 0, 0]);
  });
});
