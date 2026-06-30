import { describe, expect, it } from "vitest";
import { holding, makePortfolio } from "../__tests__/factory";
import type { ScenarioImpact } from "../types";
import { runScenario, scenarioPresets } from "./scenarios";

const book = makePortfolio(
  [
    holding({ symbol: "SPY", shares: 10, price: 100 }),
    holding({ symbol: "NVDA", shares: 10, price: 100 }),
    holding({ symbol: "TSLA", shares: 10, price: 100 }),
    holding({ symbol: "NEE", shares: 10, price: 100 }),
    holding({ symbol: "JPM", shares: 10, price: 100 }),
  ],
  0,
  {
    SPY: { beta: 1.0 },
    NVDA: { beta: 1.7, sector: "Technology" },
    TSLA: { beta: 2.0, sector: "Consumer Discretionary" },
    NEE: { beta: 0.6, sector: "Utilities" }, // bond proxy
    JPM: { beta: 1.1, sector: "Financials" }, // rate beneficiary
  }
);

const find = (impacts: ScenarioImpact[], symbol: string) =>
  impacts.find((i) => i.symbol === symbol)!;

describe("runScenario — market shock", () => {
  it("moves each holding by its beta", () => {
    const r = runScenario(book, { kind: "market", magnitude: -0.1 }, "Market −10%");
    const spy = find(r.impacts, "SPY");
    expect(spy.shockPct).toBeCloseTo(-0.1, 6); // SPY β = 1.0
    expect(spy.isDirect).toBe(true);
    // higher-beta NVDA falls further than the market
    expect(find(r.impacts, "NVDA").shockPct).toBeLessThan(spy.shockPct);
    expect(r.portfolioImpactPct).toBeLessThan(0);
    expect(r.dollarImpact).toBeLessThan(0);
  });
});

describe("runScenario — single-stock shock", () => {
  it("applies the full move to the named name and a damped spillover to the rest", () => {
    const r = runScenario(
      book,
      { kind: "stock", symbol: "TSLA", magnitude: -0.2 },
      "TSLA −20%"
    );
    const tsla = find(r.impacts, "TSLA");
    expect(tsla.shockPct).toBeCloseTo(-0.2, 6);
    expect(tsla.isDirect).toBe(true);

    const spy = find(r.impacts, "SPY");
    expect(spy.isDirect).toBe(false);
    expect(Math.abs(spy.shockPct)).toBeLessThan(0.2); // partial, correlated move
    expect(spy.shockPct).toBeLessThan(0); // same direction as the shock
  });
});

describe("runScenario — rates shock", () => {
  it("punishes bond-proxy sectors more than rate beneficiaries", () => {
    const r = runScenario(book, { kind: "rates", magnitude: 1 }, "Rates +100bp");
    const utility = find(r.impacts, "NEE"); // Utilities — bond proxy
    const financial = find(r.impacts, "JPM"); // Financials — net beneficiary
    expect(utility.shockPct).toBeLessThan(financial.shockPct);
    expect(r.dollarImpact).toBeLessThan(0); // a rate hike dings a growth book
  });
});

describe("scenarioPresets", () => {
  it("targets the largest single-stock shock at TSLA when present", () => {
    const presets = scenarioPresets(book);
    expect(presets[0].shock).toMatchObject({ kind: "stock", symbol: "TSLA" });
    expect(presets.some((p) => p.shock.kind === "market")).toBe(true);
    expect(presets.some((p) => p.shock.kind === "rates")).toBe(true);
  });

  it("falls back to the largest holding when TSLA is absent", () => {
    const noTsla = makePortfolio([
      holding({ symbol: "SPY", shares: 10, price: 100 }),
      holding({ symbol: "NVDA", shares: 5, price: 100 }),
    ]);
    const presets = scenarioPresets(noTsla);
    expect(presets[0].shock.kind).toBe("stock");
    expect(presets[0].shock.symbol).toBe("SPY"); // largest by equity
  });
});
