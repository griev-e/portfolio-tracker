import { describe, expect, it } from "vitest";
import { holding, makePortfolio } from "../../__tests__/factory";
import { dividendReport } from "./engine";
import type { DividendProfile } from "./types";

/**
 * Two completed years of quarterly payments. 2023 is four flat $0.25 quarters;
 * 2024 is $0.20, $0.20, $0.30, $0.30 — an even count with two distinct middle
 * values. The true median (average of the two middles) is $0.25, so the
 * year-over-year rate is flat. A naive upper-middle median would read $0.30 and
 * fabricate 20% growth.
 */
const evenYearProfile: DividendProfile = {
  symbol: "DIV",
  asOf: "2026-06-24",
  kind: "stock",
  forwardRate: 1.0,
  payoutRatio: 0.4,
  fcfPayout: 0.5,
  events: [
    { date: "2023-03-01", amount: 0.25 },
    { date: "2023-06-01", amount: 0.25 },
    { date: "2023-09-01", amount: 0.25 },
    { date: "2023-12-01", amount: 0.25 },
    { date: "2024-03-01", amount: 0.2 },
    { date: "2024-06-01", amount: 0.2 },
    { date: "2024-09-01", amount: 0.3 },
    { date: "2024-12-01", amount: 0.3 },
  ],
};

describe("dividendReport — annual-rate median", () => {
  it("uses a true median (averages the two middle payments) for even counts", () => {
    const portfolio = makePortfolio([
      holding({ symbol: "DIV", shares: 100, price: 50 }),
    ]);
    const report = dividendReport(portfolio, { DIV: evenYearProfile });

    // Both years resolve to a $1.00/yr rate, so growth is flat. The old
    // upper-middle median would have reported ~+20%.
    expect(report.portfolioGrowth1).not.toBeNull();
    expect(report.portfolioGrowth1!).toBeCloseTo(0, 10);
  });
});
