import { describe, expect, it } from "vitest";
import { holding, makePortfolio } from "../__tests__/factory";
import { SPX } from "../data/benchmarks";
import { riskReport } from "./risk";

// SPY (β 1.0, broad fund) + XOM (β 0.85, Energy), equal dollar, no cash.
function twoStock(cash = 0) {
  return makePortfolio(
    [
      holding({ symbol: "SPY", shares: 10, price: 100 }),
      holding({ symbol: "XOM", shares: 10, price: 100 }),
    ],
    cash,
    {
      SPY: {
        beta: 1.0,
        sector: "Diversified",
        industry: "Fund / ETF",
        fund: {
          sectorWeights: {
            Technology: 0.3,
            Financials: 0.13,
            "Health Care": 0.13,
            "Consumer Discretionary": 0.11,
            Industrials: 0.09,
            "Communication Services": 0.09,
            "Consumer Staples": 0.06,
            Energy: 0.04,
            Utilities: 0.025,
            "Real Estate": 0.025,
            Materials: 0.02,
          },
        },
      },
      XOM: { beta: 0.85, sector: "Energy", industry: "Oil & Gas Integrated" },
    }
  );
}

describe("riskReport", () => {
  it("computes concentration metrics on the invested book", () => {
    const r = riskReport(twoStock(), SPX.sectorWeights);
    expect(r.topWeight).toBeCloseTo(0.5, 6);
    expect(r.top3Weight).toBeCloseTo(1, 6);
    expect(r.hhi).toBeCloseTo(0.5, 6);
    expect(r.effectiveN).toBeCloseTo(2, 6);
  });

  it("weights beta by total value, so cash drags it down", () => {
    const noCash = riskReport(twoStock(0), SPX.sectorWeights);
    expect(noCash.beta).toBeCloseTo(0.925, 3); // 0.5·1.0 + 0.5·0.85

    const halfCash = riskReport(twoStock(2000), SPX.sectorWeights);
    expect(halfCash.beta).toBeCloseTo(0.4625, 3); // cash has β 0
    expect(halfCash.beta).toBeLessThan(noCash.beta);
  });

  it("derives a positive volatility and a finite Sharpe", () => {
    const r = riskReport(twoStock(), SPX.sectorWeights);
    expect(r.volatility).toBeGreaterThan(0);
    expect(Number.isFinite(r.sharpe)).toBe(true);
    expect(r.expectedReturn).toBeGreaterThan(0.04); // above the risk-free rate
  });

  it("spreads fund holdings across sectors via look-through", () => {
    const r = riskReport(twoStock(), SPX.sectorWeights);
    const total = r.sectors.reduce((s, x) => s + x.weight, 0);
    expect(total).toBeCloseTo(1, 4); // invested book fully accounted for
    // SPY's look-through means Energy isn't the only sector present
    expect(r.sectors.length).toBeGreaterThan(1);
  });

  it("apportions risk so contributions sum to one", () => {
    const r = riskReport(twoStock(), SPX.sectorWeights);
    const shareSum = r.contributions.reduce((s, c) => s + c.share, 0);
    expect(shareSum).toBeCloseTo(1, 4);
    expect(r.contributions).toHaveLength(2);
  });

  it("keeps every risk-contribution share non-negative on a tricky book", () => {
    // SPY's diagonal is floored (β·σ_m > σ_SPY); with the old non-PSD covariance
    // a marginal contribution share could come out negative. The structural PSD
    // covariance keeps them all ≥ 0 while still summing to 1.
    const r = riskReport(
      makePortfolio([
        holding({ symbol: "SPY", shares: 10, price: 100 }),
        holding({ symbol: "NVDA", shares: 10, price: 100 }),
        holding({ symbol: "AMD", shares: 10, price: 100 }),
        holding({ symbol: "XOM", shares: 10, price: 100 }),
      ]),
      SPX.sectorWeights
    );
    for (const c of r.contributions) expect(c.share).toBeGreaterThanOrEqual(-1e-9);
    const shareSum = r.contributions.reduce((s, c) => s + c.share, 0);
    expect(shareSum).toBeCloseTo(1, 6);
  });

  it("tracks coverage as the weight of names with fundamentals", () => {
    expect(riskReport(twoStock(0), SPX.sectorWeights).coveragePct).toBeCloseTo(1, 6);
    expect(riskReport(twoStock(2000), SPX.sectorWeights).coveragePct).toBeCloseTo(
      0.5,
      6
    );
  });

  it("collapses to a single name cleanly", () => {
    const r = riskReport(
      makePortfolio([holding({ symbol: "SPY", shares: 10, price: 100 })]),
      SPX.sectorWeights
    );
    expect(r.topWeight).toBeCloseTo(1, 6);
    expect(r.hhi).toBeCloseTo(1, 6);
    expect(r.effectiveN).toBeCloseTo(1, 6);
    expect(r.beta).toBeCloseTo(1.0, 6); // SPY β
  });

  it("excludes a no-data holding from the factor math without throwing", () => {
    const r = riskReport(
      makePortfolio(
        [
          holding({ symbol: "SPY", shares: 10, price: 100 }),
          holding({ symbol: "ZZZZ", shares: 10, price: 100 }),
        ],
        0,
        { ZZZZ: null } // no live fundamentals
      ),
      SPX.sectorWeights
    );
    expect(r.coveragePct).toBeCloseTo(0.5, 6); // only SPY is covered
    // ZZZZ must be excluded from the factor math, not silently treated as
    // riskless cash: beta should reflect SPY alone (β 1.0), not be diluted to
    // 0.5 by a weighted average over the whole (half-unpriceable) book.
    expect(r.beta).toBeCloseTo(1.0, 6);
  });

  it("renormalizes beta/volatility/expectedReturn over the priced book (cash + covered), not the whole book", () => {
    // SPY (β 1.0) + an uncovered holding, both $1000, plus $2000 cash on a
    // $4000 book: weights are SPY 0.25, ZZZZ 0.25 (excluded), cash 0.5.
    // The priced sub-portfolio is cash (0.5) + SPY (0.25) = 0.75 of the book,
    // so SPY's renormalized share of the *priced* portion is 0.25/0.75 = 1/3.
    const r = riskReport(
      makePortfolio(
        [
          holding({ symbol: "SPY", shares: 10, price: 100 }),
          holding({ symbol: "ZZZZ", shares: 10, price: 100 }),
        ],
        2000,
        { ZZZZ: null }
      ),
      SPX.sectorWeights
    );
    expect(r.coveragePct).toBeCloseTo(0.25, 6);
    expect(r.beta).toBeCloseTo(1 / 3, 6);
    // CAPM consistency: expectedReturn must equal rf + β·ERP for the same
    // (renormalized) beta this report returns (rf 0.04, ERP 0.045 defaults) —
    // the no-data exclusion can't silently decouple the two.
    expect(r.expectedReturn).toBeCloseTo(0.04 + (1 / 3) * 0.045, 6);
    expect(r.volatility).toBeGreaterThan(0);
  });
});
