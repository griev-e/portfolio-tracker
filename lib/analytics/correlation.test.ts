import { describe, expect, it } from "vitest";
import { holding, makePortfolio } from "../__tests__/factory";
import {
  type CorrInputs,
  correlationMatrix,
  covarianceMatrix,
  factorCovariance,
  pairCorrelation,
} from "./correlation";

const base: CorrInputs = {
  symbol: "A",
  beta: 1,
  vol: 0.2,
  sector: "Technology",
  industry: "Semiconductors",
  isFund: false,
};

/**
 * Dependency-free PSD check via Cholesky (with a small floor for the PD edge).
 * Returns false only if a pivot is meaningfully negative — i.e. Σ is not PSD.
 */
function isPSD(m: number[][], eps = 1e-9): boolean {
  const n = m.length;
  const L = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = m[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum < -eps) return false;
        L[i][j] = Math.sqrt(Math.max(sum, 0));
      } else {
        L[i][j] = L[j][j] > 0 ? sum / L[j][j] : 0;
      }
    }
  }
  return true;
}

function quadForm(m: number[][], w: number[]): number {
  let v = 0;
  for (let i = 0; i < w.length; i++)
    for (let j = 0; j < w.length; j++) v += w[i] * w[j] * m[i][j];
  return v;
}

describe("pairCorrelation", () => {
  it("is 1 against itself", () => {
    expect(pairCorrelation(base, base)).toBe(1);
  });

  it("adds the most affinity for a shared industry, less for a shared sector", () => {
    const sameIndustry = pairCorrelation(base, { ...base, symbol: "B" });
    const sameSector = pairCorrelation(base, {
      ...base,
      symbol: "B",
      industry: "Software",
    });
    const different = pairCorrelation(base, {
      ...base,
      symbol: "B",
      sector: "Energy",
      industry: "Oil & Gas",
    });
    expect(sameIndustry).toBeGreaterThan(sameSector);
    expect(sameSector).toBeGreaterThan(different);
  });

  it("derives correlations from the PSD covariance without an artificial clamp", () => {
    // β dominates and σ is tiny: the market factor explains nearly all variance,
    // so the implied correlation approaches (but never exceeds) 1. The old
    // [0.02, 0.96] clamp is gone — correlations now flow from the structural Σ.
    const high = pairCorrelation(
      { ...base, beta: 3, vol: 0.1 },
      { ...base, symbol: "B", beta: 3, vol: 0.1 }
    );
    // Tiny β, large σ, no shared affinity: almost no common variance.
    const low = pairCorrelation(
      { ...base, beta: 0.1, vol: 0.9, sector: "Unknown", industry: "Unknown" },
      { ...base, symbol: "B", beta: 0.1, vol: 0.9, sector: "Unknown", industry: "Unknown" }
    );
    expect(high).toBeGreaterThan(0.9);
    expect(high).toBeLessThanOrEqual(1);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(low).toBeLessThan(0.05);
  });

  it("is symmetric", () => {
    const a = { ...base, beta: 1.2, vol: 0.3 };
    const b = { ...base, symbol: "B", beta: 0.8, vol: 0.18, sector: "Energy" };
    expect(pairCorrelation(a, b)).toBeCloseTo(pairCorrelation(b, a), 12);
  });
});

describe("correlationMatrix", () => {
  const portfolio = makePortfolio([
    holding({ symbol: "NVDA", shares: 10, price: 100 }),
    holding({ symbol: "MSFT", shares: 10, price: 100 }),
    holding({ symbol: "XOM", shares: 10, price: 100 }),
  ]);

  it("has a unit diagonal and is symmetric", () => {
    const { matrix, symbols } = correlationMatrix(portfolio);
    expect(symbols).toHaveLength(3);
    for (let i = 0; i < matrix.length; i++) {
      expect(matrix[i][i]).toBe(1);
      for (let j = 0; j < matrix.length; j++) {
        expect(matrix[i][j]).toBeCloseTo(matrix[j][i], 12);
      }
    }
  });

  it("reports a sane average and the extreme pairs", () => {
    const { avgCorrelation, highest, lowest } = correlationMatrix(portfolio);
    expect(avgCorrelation).toBeGreaterThan(0);
    expect(avgCorrelation).toBeLessThan(1);
    expect(highest!.rho).toBeGreaterThanOrEqual(lowest!.rho);
  });
});

describe("covarianceMatrix", () => {
  it("recovers each name's variance on the diagonal, inflating only when over-explained", () => {
    const portfolio = makePortfolio([
      holding({ symbol: "XOM", shares: 10, price: 100 }), // budget fits inside σ²
      holding({ symbol: "SPY", shares: 10, price: 100 }), // β·σ_m already > σ_SPY
    ]);
    const { symbols } = correlationMatrix(portfolio);
    const cov = covarianceMatrix(portfolio);
    symbols.forEach((sym, i) => {
      const vol = portfolio.positions.find((p) => p.symbol === sym)!.fundamentals!
        .volatility;
      if (sym === "XOM") {
        // Market + affinity fit inside σ², so the diagonal is exactly σ².
        expect(cov[i][i]).toBeCloseTo(vol * vol, 10);
      } else {
        // SPY: β·σ_m exceeds σ_SPY, so the PSD floor inflates the diagonal a touch.
        expect(cov[i][i]).toBeGreaterThan(vol * vol);
      }
    });
  });
});

describe("PSD by construction", () => {
  // Three same-industry names plus a low-vol / high-beta name (σ 0.18, β 1.4)
  // whose β·σ_m (0.224) exceeds its own σ — the case that broke the old
  // clamped-correlation construction.
  const adversarial: CorrInputs[] = [
    { symbol: "A", beta: 1.9, vol: 0.45, sector: "Technology", industry: "Semiconductors", isFund: false },
    { symbol: "B", beta: 1.7, vol: 0.4, sector: "Technology", industry: "Semiconductors", isFund: false },
    { symbol: "C", beta: 1.5, vol: 0.35, sector: "Technology", industry: "Semiconductors", isFund: false },
    { symbol: "D", beta: 1.4, vol: 0.18, sector: "Utilities", industry: "Electric Utilities", isFund: false },
  ];

  it("produces a positive semi-definite covariance (Cholesky succeeds)", () => {
    expect(isPSD(factorCovariance(adversarial))).toBe(true);
  });

  it("yields non-negative portfolio variance without a max(…, 0) guard", () => {
    const cov = factorCovariance(adversarial);
    const w = [0.25, 0.25, 0.25, 0.25];
    expect(quadForm(cov, w)).toBeGreaterThanOrEqual(-1e-12);
    // also for a long/short-ish weighting, PSD still guarantees ≥ 0
    expect(quadForm(cov, [0.6, -0.2, 0.4, 0.2])).toBeGreaterThanOrEqual(-1e-12);
  });
});
