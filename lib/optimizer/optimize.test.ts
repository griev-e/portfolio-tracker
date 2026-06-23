import { describe, expect, it } from "vitest";
import { holding, makePortfolio } from "../__tests__/factory";
import { optimizePortfolio } from "./optimize";
import type { ObjectiveId, OptimizerConstraints } from "./types";

/**
 * The optimizer is a constrained solver over the shared factor covariance, so
 * the meaningful tests are invariants (feasibility, constraint satisfaction,
 * determinism) and the directional sanity of each objective — not exact weights,
 * which are model outputs.
 */

// A spread of names with bundled fundamentals (varied beta / vol / yield / ROIC).
const PORTFOLIO = makePortfolio(
  [
    holding({ symbol: "NVDA", shares: 20, price: 120, averageCost: 80 }),
    holding({ symbol: "AAPL", shares: 30, price: 200, averageCost: 150 }),
    holding({ symbol: "MSFT", shares: 15, price: 400, averageCost: 300 }),
    holding({ symbol: "JNJ", shares: 40, price: 160, averageCost: 150 }),
    holding({ symbol: "KO", shares: 50, price: 60, averageCost: 55 }),
    holding({ symbol: "XOM", shares: 25, price: 110, averageCost: 90 }),
  ],
  5000
);

const DEFAULTS: OptimizerConstraints = {
  maxWeight: 0.3,
  minWeight: 0,
  allowExit: true,
};
const ALL: ObjectiveId[] = [
  "sharpe",
  "min-vol",
  "risk-parity",
  "max-div",
  "max-return",
  "income",
  "quality",
  "equal",
];

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe("optimizePortfolio", () => {
  it("returns null for an empty book", () => {
    expect(optimizePortfolio(makePortfolio([], 1000), "sharpe", DEFAULTS)).toBeNull();
  });

  it("returns null when there is no invested equity", () => {
    // cash only — nothing to optimize over
    const r = optimizePortfolio(makePortfolio([], 0), "min-vol", DEFAULTS);
    expect(r).toBeNull();
  });

  it.each(ALL)("produces a feasible solution for %s", (objective) => {
    const r = optimizePortfolio(PORTFOLIO, objective, DEFAULTS);
    expect(r).not.toBeNull();
    const w = r!.positions.map((p) => p.targetWeight);
    // invested weights form a simplex
    expect(sum(w)).toBeCloseTo(1, 4);
    for (const x of w) expect(x).toBeGreaterThanOrEqual(-1e-9);
    // every name respects the cap (with a tiny numerical tolerance)
    for (const x of w) expect(x).toBeLessThanOrEqual(DEFAULTS.maxWeight + 1e-6);
  });

  it("is deterministic — identical inputs give identical weights", () => {
    const a = optimizePortfolio(PORTFOLIO, "sharpe", DEFAULTS)!;
    const b = optimizePortfolio(PORTFOLIO, "sharpe", DEFAULTS)!;
    expect(a.positions.map((p) => p.targetWeight)).toEqual(
      b.positions.map((p) => p.targetWeight)
    );
  });

  it("min-vol is no riskier than max-return, which earns more", () => {
    const minVol = optimizePortfolio(PORTFOLIO, "min-vol", DEFAULTS)!;
    const maxRet = optimizePortfolio(PORTFOLIO, "max-return", DEFAULTS)!;
    expect(minVol.metricsAfter.volatility).toBeLessThanOrEqual(
      maxRet.metricsAfter.volatility + 1e-9
    );
    expect(maxRet.metricsAfter.expectedReturn).toBeGreaterThanOrEqual(
      minVol.metricsAfter.expectedReturn - 1e-9
    );
  });

  it("min-vol does not increase volatility versus the current book", () => {
    const r = optimizePortfolio(PORTFOLIO, "min-vol", DEFAULTS)!;
    expect(r.metricsAfter.volatility).toBeLessThanOrEqual(
      r.metricsBefore.volatility + 1e-9
    );
  });

  it("max-sharpe does not produce a worse Sharpe than the current book", () => {
    const r = optimizePortfolio(PORTFOLIO, "sharpe", DEFAULTS)!;
    expect(r.metricsAfter.sharpe).toBeGreaterThanOrEqual(
      r.metricsBefore.sharpe - 1e-9
    );
  });

  it("equal weight spreads evenly within the cap", () => {
    const r = optimizePortfolio(PORTFOLIO, "equal", DEFAULTS)!;
    const n = r.positions.length;
    for (const p of r.positions) {
      expect(p.targetWeight).toBeCloseTo(1 / n, 4);
    }
  });

  it("a tighter cap lowers the top weight", () => {
    const loose = optimizePortfolio(PORTFOLIO, "max-return", { maxWeight: 0.6, minWeight: 0, allowExit: true })!;
    const tight = optimizePortfolio(PORTFOLIO, "max-return", { maxWeight: 0.25, minWeight: 0, allowExit: true })!;
    expect(tight.metricsAfter.topWeight).toBeLessThanOrEqual(
      loose.metricsAfter.topWeight + 1e-9
    );
    expect(tight.metricsAfter.topWeight).toBeLessThanOrEqual(0.25 + 1e-6);
  });

  it("the hold floor keeps held names from being fully exited", () => {
    // allowExit off + a 5% floor: every currently-held name stays above it.
    const r = optimizePortfolio(PORTFOLIO, "sharpe", {
      maxWeight: 0.4,
      minWeight: 0.05,
      allowExit: false,
    })!;
    for (const p of r.positions) {
      expect(p.targetWeight).toBeGreaterThanOrEqual(0.05 - 1e-6);
    }
    expect(sum(r.positions.map((p) => p.targetWeight))).toBeCloseTo(1, 4);
  });

  it("allowExit lets the optimizer drive a name to zero", () => {
    // max-return with a high cap concentrates into the highest-μ names; with
    // exits allowed, at least one held name should be fully trimmed out.
    const r = optimizePortfolio(PORTFOLIO, "max-return", {
      maxWeight: 0.5,
      minWeight: 0.05,
      allowExit: true,
    })!;
    expect(r.positions.some((p) => p.targetWeight < 1e-6)).toBe(true);
  });

  it("income tilts the book toward higher yield", () => {
    const income = optimizePortfolio(PORTFOLIO, "income", DEFAULTS)!;
    expect(income.metricsAfter.yield).toBeGreaterThanOrEqual(
      income.metricsBefore.yield - 1e-9
    );
  });

  it("builds an upward-sloping efficient frontier", () => {
    const r = optimizePortfolio(PORTFOLIO, "sharpe", DEFAULTS)!;
    expect(r.frontier.length).toBeGreaterThan(1);
    for (let i = 1; i < r.frontier.length; i++) {
      expect(r.frontier[i].vol).toBeGreaterThanOrEqual(r.frontier[i - 1].vol - 1e-9);
      expect(r.frontier[i].ret).toBeGreaterThanOrEqual(r.frontier[i - 1].ret - 1e-9);
    }
  });
});
