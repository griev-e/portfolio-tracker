import { describe, expect, it } from "vitest";
import { holding, makePortfolio } from "../__tests__/factory";
import {
  buildGroups,
  currentTargets,
  equalTargets,
  planRebalance,
  type RebalanceOptions,
} from "./rebalance";

/**
 * The rebalance engine produces trade tickets, so the tests assert the money
 * invariants: cash conservation, buy-only in deploy mode, exact targeting in
 * full mode, drift reduction, and whole-share rounding — across the holding /
 * sector / style targeting bases.
 */

// Two names in different sectors (AAPL=Tech, JPM=Financials).
const twoSector = () =>
  makePortfolio(
    [
      holding({ symbol: "AAPL", shares: 75, price: 100 }), // $7,500
      holding({ symbol: "JPM", shares: 25, price: 100 }), // $2,500
    ],
    1000, // cash
    { JPM: { sector: "Financials" } }
  );

const opts = (o: Partial<RebalanceOptions>): RebalanceOptions => ({
  basis: "holding",
  targets: {},
  contribution: 0,
  mode: "deploy",
  alsoDeployCash: false,
  wholeShares: false,
  ...o,
});

describe("buildGroups", () => {
  it("buckets per-holding with one member each, sorted by value", () => {
    const groups = buildGroups(twoSector(), "holding");
    expect(groups.map((g) => g.id)).toEqual(["AAPL", "JPM"]);
    expect(groups[0].members).toEqual(["AAPL"]);
    expect(groups[0].currentWeight).toBeCloseTo(0.75, 6);
    expect(groups[1].currentWeight).toBeCloseTo(0.25, 6);
  });

  it("buckets by sector, collapsing same-sector holdings together", () => {
    const portfolio = makePortfolio(
      [
        holding({ symbol: "AAPL", shares: 50, price: 100 }), // Technology
        holding({ symbol: "MSFT", shares: 50, price: 100 }), // Technology
        holding({ symbol: "JPM", shares: 100, price: 100 }), // Financials
      ],
      0,
      { JPM: { sector: "Financials" } }
    );
    const groups = buildGroups(portfolio, "sector");
    const tech = groups.find((g) => g.id === "Technology")!;
    expect(tech.members.sort()).toEqual(["AAPL", "MSFT"]);
    expect(tech.currentValue).toBeCloseTo(10000, 6);
  });

  it("buckets by classified style, assigning each holding a known style bucket", () => {
    const portfolio = makePortfolio([
      holding({ symbol: "AAPL", shares: 50, price: 100 }),
      holding({ symbol: "JPM", shares: 50, price: 100 }),
    ]);
    const groups = buildGroups(portfolio, "style");
    const styles = new Set(["Growth", "Value", "Dividend", "Momentum", "Low Vol"]);
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) expect(styles.has(g.id)).toBe(true);
    // Every owned name is placed in exactly one bucket.
    expect(groups.flatMap((g) => g.members).sort()).toEqual(["AAPL", "JPM"]);
  });

  it("plans a full-mode rebalance on the style basis end-to-end", () => {
    const portfolio = makePortfolio([
      holding({ symbol: "AAPL", shares: 75, price: 100 }),
      holding({ symbol: "JPM", shares: 25, price: 100 }),
    ]);
    const groups = buildGroups(portfolio, "style");
    const plan = planRebalance(
      portfolio,
      opts({ basis: "style", mode: "full", targets: equalTargets(groups) })
    );
    expect(plan.basis).toBe("style");
    expect(plan.driftAfter).toBeLessThanOrEqual(plan.driftBefore + 1e-9);
  });
});

describe("currentTargets / equalTargets", () => {
  it("currentTargets reproduces today's weights as percentages", () => {
    const groups = buildGroups(twoSector(), "holding");
    const t = currentTargets(groups);
    expect(t.AAPL).toBeCloseTo(75, 6);
    expect(t.JPM).toBeCloseTo(25, 6);
  });

  it("equalTargets splits evenly across buckets", () => {
    const groups = buildGroups(twoSector(), "holding");
    const t = equalTargets(groups);
    expect(t.AAPL).toBeCloseTo(50, 6);
    expect(t.JPM).toBeCloseTo(50, 6);
  });
});

describe("planRebalance — deploy mode", () => {
  it("only buys, never sells, and conserves cash", () => {
    const plan = planRebalance(
      twoSector(),
      opts({ contribution: 2000, targets: { AAPL: 50, JPM: 50 } })
    );
    expect(plan.sellTotal).toBe(0);
    expect(plan.orders.every((o) => o.action !== "sell")).toBe(true);
    // Cash conservation: new cash = old cash + contribution − net deployed.
    expect(plan.newCash).toBeCloseTo(1000 + 2000 - plan.cashDeployed, 6);
    // Buys flow to the underweight bucket (JPM at 25% heading toward 50%).
    const jpm = plan.orders.find((o) => o.symbol === "JPM")!;
    const aapl = plan.orders.find((o) => o.symbol === "AAPL")!;
    expect(jpm.dollars).toBeGreaterThan(aapl.dollars);
  });

  it("reduces drift toward the target weights", () => {
    const plan = planRebalance(
      twoSector(),
      opts({ contribution: 5000, targets: { AAPL: 50, JPM: 50 } })
    );
    expect(plan.driftAfter).toBeLessThan(plan.driftBefore);
  });

  it("pours a too-small contribution in proportionally (water toward targets)", () => {
    // Contribution far smaller than the total shortfall → scaled down, fully spent.
    const plan = planRebalance(
      twoSector(),
      opts({ contribution: 100, targets: { AAPL: 0, JPM: 100 } })
    );
    expect(plan.cashDeployed).toBeCloseTo(100, 4);
    expect(plan.leftoverCash).toBeCloseTo(0, 4);
  });

  it("also deploys idle cash when asked", () => {
    const withCash = planRebalance(
      twoSector(),
      opts({ contribution: 0, alsoDeployCash: true, targets: { AAPL: 50, JPM: 50 } })
    );
    expect(withCash.cashDeployed).toBeGreaterThan(0);
  });
});

describe("planRebalance — full mode", () => {
  it("buys and sells to hit the target weights exactly", () => {
    const plan = planRebalance(
      twoSector(),
      opts({ mode: "full", targets: { AAPL: 50, JPM: 50 } })
    );
    // AAPL is overweight (75%) → sold; JPM underweight (25%) → bought.
    const aapl = plan.orders.find((o) => o.symbol === "AAPL")!;
    const jpm = plan.orders.find((o) => o.symbol === "JPM")!;
    expect(aapl.action).toBe("sell");
    expect(jpm.action).toBe("buy");
    expect(aapl.projectedWeight).toBeCloseTo(0.5, 4);
    expect(jpm.projectedWeight).toBeCloseTo(0.5, 4);
    expect(plan.driftAfter).toBeCloseTo(0, 4);
  });

  it("falls back to the current mix when no targets are supplied", () => {
    const plan = planRebalance(twoSector(), opts({ mode: "full", targets: {} }));
    // Targeting today's weights means no trades.
    expect(plan.tradeCount).toBe(0);
    expect(plan.buyTotal).toBeCloseTo(0, 6);
    expect(plan.sellTotal).toBeCloseTo(0, 6);
  });
});

describe("planRebalance — whole-share rounding", () => {
  it("rounds trades to whole shares so dollars are share-multiples of price", () => {
    const plan = planRebalance(
      twoSector(),
      opts({
        contribution: 2000,
        wholeShares: true,
        targets: { AAPL: 50, JPM: 50 },
      })
    );
    for (const o of plan.orders) {
      if (o.action === "hold") continue;
      const shares = o.dollars / o.price;
      expect(shares).toBeCloseTo(Math.round(shares), 6);
    }
  });
});

describe("planRebalance — degenerate inputs", () => {
  it("does nothing with no contribution and no cash to deploy", () => {
    const plan = planRebalance(twoSector(), opts({ contribution: 0 }));
    expect(plan.tradeCount).toBe(0);
    expect(plan.cashDeployed).toBeCloseTo(0, 6);
  });

  it("clamps a negative contribution to zero", () => {
    const plan = planRebalance(twoSector(), opts({ contribution: -500 }));
    expect(plan.contribution).toBe(0);
    expect(plan.tradeCount).toBe(0);
  });
});
