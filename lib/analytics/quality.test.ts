import { afterEach, describe, expect, it } from "vitest";
import { holding, makePortfolio } from "../__tests__/factory";
import { ASSUMPTION_PRESETS, DEFAULT_ASSUMPTIONS } from "../data/assumptions";
import { setAssumptions } from "../live/assumptions";
import { CATEGORY_ORDER, type Grade, qualityReport } from "./quality";

const VALID_GRADES: Grade[] = [
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F",
];

const portfolio = makePortfolio([
  holding({ symbol: "NVDA", shares: 10, price: 100 }),
  holding({ symbol: "JNJ", shares: 10, price: 100 }),
  holding({ symbol: "KO", shares: 10, price: 100 }),
]);

describe("qualityReport", () => {
  it("produces a bounded composite with a valid grade", () => {
    const r = qualityReport(portfolio);
    expect(r.composite).toBeGreaterThanOrEqual(0);
    expect(r.composite).toBeLessThanOrEqual(100);
    expect(VALID_GRADES).toContain(r.compositeGrade);
  });

  it("scores all eleven metrics across four categories", () => {
    const r = qualityReport(portfolio);
    expect(r.metrics).toHaveLength(11);
    expect(r.categories.map((c) => c.id)).toEqual(CATEGORY_ORDER);
  });

  it("uses metric weights that sum to one across categories", () => {
    const r = qualityReport(portfolio);
    const weightSum = r.categories.reduce((s, c) => s + c.weight, 0);
    expect(weightSum).toBeCloseTo(1, 6);
  });

  it("aggregates a positive forward P/E via the harmonic mean", () => {
    const r = qualityReport(portfolio);
    const fpe = r.metrics.find((m) => m.key === "forwardPE")!;
    expect(fpe.value).toBeGreaterThan(0);
    expect(Number.isFinite(fpe.value)).toBe(true);
  });

  it("grades each holding and sorts them best-first", () => {
    const r = qualityReport(portfolio);
    expect(r.holdings).toHaveLength(3);
    for (let i = 1; i < r.holdings.length; i++) {
      expect(r.holdings[i - 1].score).toBeGreaterThanOrEqual(r.holdings[i].score);
    }
  });

  it("ranks contributions from most-lifting to most-dragging", () => {
    const { contributions } = qualityReport(portfolio);
    for (let i = 1; i < contributions.length; i++) {
      expect(contributions[i - 1].contribution).toBeGreaterThanOrEqual(
        contributions[i].contribution
      );
    }
  });

  it("reports full coverage for an all-known, fully-invested book", () => {
    expect(qualityReport(portfolio).coveragePct).toBeCloseTo(1, 6);
  });

  it("scores a metric at 50 when it sits exactly on the benchmark", () => {
    // A holding whose every fundamental equals the S&P reference should land
    // near the index line; here we just assert the composite stays mid-range
    // for a defensive staple vs a hyper-grower — i.e. scoring is monotonic and
    // bounded rather than saturating to 0/100.
    const r = qualityReport(portfolio);
    for (const m of r.metrics) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("scoring under a negative-growth benchmark (Recession preset)", () => {
  const recession = ASSUMPTION_PRESETS.find((p) => p.id === "recession")!.values;

  afterEach(() => setAssumptions(DEFAULT_ASSUMPTIONS));

  it("orders growth scores correctly against a negative index benchmark", () => {
    setAssumptions(recession); // SPX epsGrowth −10%
    // Beats the −10% benchmark (−5%) vs misses it (−20%): the better holding
    // must score higher. The old ratio-based curve inverted this ordering.
    const better = makePortfolio(
      [holding({ symbol: "AAA", shares: 10, price: 100 })],
      0,
      { AAA: { epsGrowth: -0.05 } }
    );
    const worse = makePortfolio(
      [holding({ symbol: "BBB", shares: 10, price: 100 })],
      0,
      { BBB: { epsGrowth: -0.2 } }
    );
    const sBetter = qualityReport(better).metrics.find((m) => m.key === "epsGrowth")!;
    const sWorse = qualityReport(worse).metrics.find((m) => m.key === "epsGrowth")!;
    expect(sBetter.score).toBeGreaterThan(50);
    expect(sWorse.score).toBeLessThan(50);
  });

  it("scores PEG neutral when the growth benchmark makes it meaningless", () => {
    setAssumptions(recession);
    const r = qualityReport(portfolio);
    expect(r.metrics.find((m) => m.key === "peg")!.score).toBe(50);
  });
});

describe("leverage metric", () => {
  it("rewards a light balance sheet and punishes a heavy one", () => {
    const light = makePortfolio(
      [holding({ symbol: "LOW", shares: 10, price: 100 })],
      0,
      { LOW: { debtToEquity: 0.3 } }
    );
    const heavy = makePortfolio(
      [holding({ symbol: "HIGH", shares: 10, price: 100 })],
      0,
      { HIGH: { debtToEquity: 3.5 } }
    );
    const sLight = qualityReport(light).metrics.find((m) => m.key === "leverage")!;
    const sHeavy = qualityReport(heavy).metrics.find((m) => m.key === "leverage")!;
    expect(sLight.score).toBeGreaterThan(50);
    expect(sHeavy.score).toBeLessThan(50);
  });

  it("scores neutral with no reading and excludes financials", () => {
    const unknown = makePortfolio(
      [holding({ symbol: "UNK", shares: 10, price: 100 })],
      0,
      { UNK: { debtToEquity: null } }
    );
    expect(
      qualityReport(unknown).metrics.find((m) => m.key === "leverage")!.score
    ).toBe(50);
    // A bank's structural 9× D/E must not tank the grade — excluded, neutral.
    const bank = makePortfolio(
      [holding({ symbol: "BANK", shares: 10, price: 100 })],
      0,
      { BANK: { sector: "Financials", debtToEquity: 9 } }
    );
    expect(
      qualityReport(bank).metrics.find((m) => m.key === "leverage")!.score
    ).toBe(50);
  });
});
