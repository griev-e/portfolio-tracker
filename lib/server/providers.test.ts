import { describe, expect, it } from "vitest";
import { sectorFromIndustry } from "./finnhub";
import { sanitizeImplausibleFields } from "./fundamentals";
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

describe("sanitizeImplausibleFields", () => {
  it("drops a statistically implausible beta (regression blow-up on thin history)", () => {
    const patch = { symbol: "RVI", asOf: "2026-06-30T00:00:00.000Z", beta: -31.45 };
    const sanitized = sanitizeImplausibleFields(patch);
    expect(sanitized.beta).toBeUndefined();
    // Every other field is untouched.
    expect(sanitized.symbol).toBe("RVI");
  });

  it("keeps a plausible beta, including leveraged/inverse-fund extremes", () => {
    expect(sanitizeImplausibleFields({ beta: 1.1 }).beta).toBe(1.1);
    expect(sanitizeImplausibleFields({ beta: -3 }).beta).toBe(-3);
    expect(sanitizeImplausibleFields({ beta: 4.9 }).beta).toBe(4.9);
  });

  it("rejects beta symmetrically on the positive side too", () => {
    expect(sanitizeImplausibleFields({ beta: 12 }).beta).toBeUndefined();
  });

  it("drops a statistically implausible volatility (wild prints on thin history)", () => {
    const sanitized = sanitizeImplausibleFields({ symbol: "RVI", volatility: 11.2 });
    expect(sanitized.volatility).toBeUndefined();
    expect(sanitized.symbol).toBe("RVI");
  });

  it("keeps a plausible volatility, including genuinely volatile small caps", () => {
    expect(sanitizeImplausibleFields({ volatility: 0.28 }).volatility).toBe(0.28);
    expect(sanitizeImplausibleFields({ volatility: 1.4 }).volatility).toBe(1.4);
    expect(sanitizeImplausibleFields({ volatility: 2.9 }).volatility).toBe(2.9);
  });

  it("sanitizes beta and volatility independently in the same patch", () => {
    const sanitized = sanitizeImplausibleFields({ beta: -31.45, volatility: 0.4 });
    expect(sanitized.beta).toBeUndefined();
    expect(sanitized.volatility).toBe(0.4);
  });

  it("is a no-op when both fields are already absent", () => {
    const patch: { symbol: string; beta?: number; volatility?: number } = {
      symbol: "ZZZ",
    };
    expect(sanitizeImplausibleFields(patch)).toEqual(patch);
  });
});

describe("roicFrom invested capital", () => {
  it("subtracts cash from invested capital (cash-rich names aren't penalized)", () => {
    // EBIT 100, 21% default tax → NOPAT 79. Equity 500 + debt 300 − cash 300
    // = invested 500 → ROIC 15.8%; leaving cash in would misreport 9.9%.
    const withCash = roicFrom({ ebit: 100, equity: 500, debt: 300, cash: 300 })!;
    const withoutCash = roicFrom({ ebit: 100, equity: 500, debt: 300 })!;
    expect(withCash).toBeCloseTo(79 / 500, 10);
    expect(withCash).toBeGreaterThan(withoutCash);
  });

  it("returns undefined when cash exceeds the capital base", () => {
    expect(roicFrom({ ebit: 50, equity: 100, debt: 0, cash: 200 })).toBeUndefined();
  });
});
