import { describe, expect, it } from "vitest";
import { fundamentals, holding, makePortfolio } from "../__tests__/factory";
import { factorScores, portfolioFactors } from "./factors";

/**
 * The factory's neutral `fundamentals` sits on every squash midpoint, so a
 * broad-market profile should score ~50 on each factor — the design anchor.
 * From there each factor is verified to move monotonically with its driver and
 * stay inside the 0–100 band.
 */
describe("factorScores", () => {
  it("scores a broad-market profile near 50 on every factor", () => {
    const s = factorScores(fundamentals({ symbol: "MKT" }));
    expect(s.growth).toBeCloseTo(50, 0);
    expect(s.value).toBeCloseTo(50, 0);
    expect(s.quality).toBeCloseTo(50, 0);
    expect(s.momentum).toBeCloseTo(50, 0);
  });

  it("lifts growth as revenue/eps/fcf growth rise", () => {
    const lo = factorScores(
      fundamentals({ symbol: "LO", revenueGrowth: 0, epsGrowth: 0, fcfGrowth: 0 })
    );
    const hi = factorScores(
      fundamentals({ symbol: "HI", revenueGrowth: 0.3, epsGrowth: 0.4, fcfGrowth: 0.3 })
    );
    expect(hi.growth).toBeGreaterThan(lo.growth);
    expect(hi.growth).toBeGreaterThan(70);
    expect(lo.growth).toBeLessThan(30);
  });

  it("rewards a cheaper valuation (higher earnings/fcf yield)", () => {
    const rich = factorScores(fundamentals({ symbol: "RICH", forwardPE: 60, fcfYield: 0.01 }));
    const cheap = factorScores(fundamentals({ symbol: "CHEAP", forwardPE: 9, fcfYield: 0.09 }));
    expect(cheap.value).toBeGreaterThan(rich.value);
  });

  it("treats a null/unprofitable forwardPE as zero earnings yield", () => {
    const nullPE = factorScores(fundamentals({ symbol: "N", forwardPE: null }));
    const negPE = factorScores(fundamentals({ symbol: "NEG", forwardPE: -10 }));
    // Both collapse the earnings-yield term to 0, so they score identically.
    expect(nullPE.value).toBe(negPE.value);
    // …and below a profitable, reasonably-priced name.
    expect(nullPE.value).toBeLessThan(factorScores(fundamentals({ symbol: "P" })).value);
  });

  it("raises quality with ROIC and margins, momentum with trailing return", () => {
    const weak = factorScores(
      fundamentals({ symbol: "W", roic: 0.02, operatingMargin: 0.04, grossMargin: 0.2, return12m: -0.4 })
    );
    const strong = factorScores(
      fundamentals({ symbol: "S", roic: 0.35, operatingMargin: 0.4, grossMargin: 0.75, return12m: 0.6 })
    );
    expect(strong.quality).toBeGreaterThan(weak.quality);
    expect(strong.momentum).toBeGreaterThan(weak.momentum);
  });

  it("keeps every score within the 0–100 band at the extremes", () => {
    const extreme = factorScores(
      fundamentals({
        symbol: "X",
        revenueGrowth: 5,
        epsGrowth: 5,
        fcfGrowth: 5,
        forwardPE: 1,
        fcfYield: 1,
        dividendYield: 1,
        roic: 5,
        operatingMargin: 5,
        grossMargin: 5,
        return12m: 5,
      })
    );
    for (const v of Object.values(extreme)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("rounds each score to one decimal place", () => {
    const s = factorScores(fundamentals({ symbol: "R", revenueGrowth: 0.123 }));
    for (const v of Object.values(s)) {
      expect(Math.round(v * 10)).toBe(v * 10);
    }
  });
});

describe("portfolioFactors", () => {
  it("income-weights position scores and reports full coverage", () => {
    // AAPL/MSFT are in the bundled snapshot, so both carry fundamentals.
    const portfolio = makePortfolio([
      holding({ symbol: "AAPL", shares: 30, price: 100 }),
      holding({ symbol: "MSFT", shares: 10, price: 100 }),
    ]);
    const pf = portfolioFactors(portfolio);

    expect(pf.byPosition).toHaveLength(2);
    // Sorted by weight, heaviest first.
    expect(pf.byPosition[0].symbol).toBe("AAPL");
    expect(pf.byPosition[0].weight).toBeGreaterThan(pf.byPosition[1].weight);
    // Full snapshot coverage → ~100%.
    expect(pf.coveragePct).toBeCloseTo(1, 5);

    // The aggregate equals the equity-weighted mean of the per-position scores.
    const manual =
      pf.byPosition.reduce((a, b) => a + b.weight * b.scores.growth, 0) / pf.coveragePct;
    expect(pf.growth).toBeCloseTo(Math.round(manual * 10) / 10, 5);
  });

  it("skips positions without fundamentals and tracks partial coverage", () => {
    // ZZZZ has no live fundamentals → excluded from the math.
    const portfolio = makePortfolio(
      [
        holding({ symbol: "AAPL", shares: 10, price: 100 }),
        holding({ symbol: "ZZZZ", shares: 10, price: 100 }),
      ],
      0,
      { ZZZZ: null }
    );
    const pf = portfolioFactors(portfolio);
    expect(pf.byPosition.map((b) => b.symbol)).toEqual(["AAPL"]);
    expect(pf.coveragePct).toBeLessThan(1);
    expect(pf.coveragePct).toBeGreaterThan(0);
  });

  it("returns finite scores (no divide-by-zero) when nothing is covered", () => {
    const portfolio = makePortfolio(
      [holding({ symbol: "ZZZZ", shares: 10, price: 100 })],
      0,
      { ZZZZ: null }
    );
    const pf = portfolioFactors(portfolio);
    expect(pf.coveragePct).toBe(0);
    expect(Number.isFinite(pf.growth)).toBe(true);
    expect(pf.growth).toBe(0);
  });
});
