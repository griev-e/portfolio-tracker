import { describe, expect, it } from "vitest";
import { classifyRegion, regionsFromSegmentation } from "./fmp";
import { sectorFromIndustry } from "./finnhub";
import { annualizedVol, fcfGrowthFromStatements, roicFrom } from "./yahoo";

describe("annualizedVol", () => {
  it("returns undefined for short series", () => {
    expect(annualizedVol([100, 101, 102])).toBeUndefined();
  });

  it("returns undefined for a flat series (no variance)", () => {
    expect(annualizedVol(Array(40).fill(100))).toBeUndefined();
  });

  it("annualizes daily return vol by sqrt(252)", () => {
    // Alternating ±1% moves: daily stdev ~0.01 → annualized ~0.16.
    const closes = [100];
    for (let i = 1; i < 60; i++) closes.push(closes[i - 1] * (i % 2 ? 1.01 : 1 / 1.01));
    const v = annualizedVol(closes)!;
    expect(v).toBeGreaterThan(0.1);
    expect(v).toBeLessThan(0.25);
  });
});

describe("fcfGrowthFromStatements", () => {
  it("computes YoY FCF growth (CFO + capex), newest first", () => {
    const g = fcfGrowthFromStatements([
      { cfo: 120, capex: -20 }, // FCF 100
      { cfo: 100, capex: -20 }, // FCF 80
    ]);
    expect(g).toBeCloseTo(0.25);
  });

  it("is undefined without two usable years", () => {
    expect(fcfGrowthFromStatements([{ cfo: 100, capex: -10 }])).toBeUndefined();
    expect(
      fcfGrowthFromStatements([{ cfo: 100 }, { cfo: 90, capex: -10 }])
    ).toBeUndefined();
  });
});

describe("roicFrom", () => {
  it("computes NOPAT / invested capital with an effective tax rate", () => {
    const r = roicFrom({
      ebit: 100,
      incomeBeforeTax: 90,
      incomeTaxExpense: 18, // 20% effective
      equity: 400,
      debt: 100,
    });
    expect(r).toBeCloseTo(0.16); // 100*0.8 / 500
  });

  it("is undefined when components are missing or capital is zero", () => {
    expect(roicFrom({ ebit: 100, equity: undefined })).toBeUndefined();
    expect(roicFrom({ ebit: 100, equity: 0, debt: 0 })).toBeUndefined();
  });
});

describe("classifyRegion", () => {
  it("buckets common geography labels", () => {
    expect(classifyRegion("United States")).toBe("US");
    expect(classifyRegion("U.S.")).toBe("US");
    expect(classifyRegion("Germany")).toBe("Europe");
    expect(classifyRegion("Greater China")).toBe("Asia-Pacific");
    expect(classifyRegion("Japan")).toBe("Asia-Pacific");
    expect(classifyRegion("Latin America")).toBe("Emerging");
  });
});

describe("regionsFromSegmentation", () => {
  it("collapses and normalizes a flat segmentation record", () => {
    const r = regionsFromSegmentation({
      "United States": 800,
      China: 150,
      Germany: 50,
    })!;
    expect(r.US).toBeCloseTo(0.8);
    expect(r["Asia-Pacific"]).toBeCloseTo(0.15);
    expect(r.Europe).toBeCloseTo(0.05);
    const sum = Object.values(r).reduce((s, w) => s + (w ?? 0), 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("returns undefined when there is no positive revenue", () => {
    expect(regionsFromSegmentation({ Nowhere: 0 })).toBeUndefined();
  });
});

describe("sectorFromIndustry (Finnhub)", () => {
  it("maps common Finnhub industries to sector buckets", () => {
    expect(sectorFromIndustry("Semiconductors")).toBe("Technology");
    expect(sectorFromIndustry("Software")).toBe("Technology");
    expect(sectorFromIndustry("Pharmaceuticals")).toBe("Health Care");
    expect(sectorFromIndustry("Banking")).toBe("Financials");
    expect(sectorFromIndustry("Oil & Gas")).toBe("Energy");
    expect(sectorFromIndustry("Utilities")).toBe("Utilities");
    expect(sectorFromIndustry("Real Estate")).toBe("Real Estate");
    expect(sectorFromIndustry("Media")).toBe("Communication Services");
  });

  it("returns undefined for unknown or missing industries (no forced guess)", () => {
    expect(sectorFromIndustry(undefined)).toBeUndefined();
    expect(sectorFromIndustry("Conglomerate Holdings")).toBeUndefined();
  });
});
