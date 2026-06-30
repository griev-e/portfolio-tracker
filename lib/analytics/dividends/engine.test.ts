import { describe, expect, it } from "vitest";
import { holding, makePortfolio } from "../../__tests__/factory";
import { buildPortfolio } from "../build";
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

/* ── Helpers for the safety / frequency / calendar branch coverage ──────── */

/** Four equal quarterly payments per completed year; `rate(year)` is the
 *  per-share annual rate, recovered exactly by the engine's median × count. */
function quarterlyProfile(
  symbol: string,
  startYear: number,
  endYear: number,
  rate: (year: number) => number,
  extra: Partial<DividendProfile> = {}
): DividendProfile {
  const events = [];
  for (let y = startYear; y <= endYear; y++) {
    const q = rate(y) / 4;
    for (const m of ["03", "06", "09", "12"]) {
      events.push({ date: `${y}-${m}-15`, amount: q });
    }
  }
  return {
    symbol,
    asOf: "2025-01-01",
    kind: "stock",
    forwardRate: rate(endYear),
    payoutRatio: 0.4,
    fcfPayout: 0.5,
    events,
    ...extra,
  };
}

describe("dividendReport — income source fallbacks", () => {
  it("estimates income from the fundamentals yield when no profile exists", () => {
    // AAPL carries a live dividend yield but gets no profile here.
    const portfolio = makePortfolio([holding({ symbol: "AAPL", shares: 100, price: 200 })]);
    const report = dividendReport(portfolio, {});
    expect(report.payerCount).toBe(1);
    expect(report.estimatedCount).toBe(1);
    const h = report.holdings[0];
    expect(h.estimated).toBe(true);
    expect(h.income).toBeGreaterThan(0);
    expect(h.flags).toContain("Income estimated from yield — provider history unavailable");
  });

  it("drops a position that pays nothing and has no yield", () => {
    // Zero dividend yield and no profile → not a payer.
    const portfolio = makePortfolio(
      [holding({ symbol: "NODIV", shares: 10, price: 100 })],
      0,
      { NODIV: { dividendYield: 0 } }
    );
    const report = dividendReport(portfolio, {});
    expect(report.payerCount).toBe(0);
    expect(report.holdings).toHaveLength(0);
  });
});

describe("dividendReport — safety branches", () => {
  it("rewards a low-payout aristocrat with a long increase streak", () => {
    const profile = quarterlyProfile("ARIS", 1995, 2024, (y) => 0.5 + (y - 1995) * 0.05, {
      payoutRatio: 0.3, // < 0.4 → +20
      fcfPayout: 0.4, // < 0.5 → +12
    });
    const portfolio = makePortfolio([holding({ symbol: "ARIS", shares: 100, price: 100 })]);
    const h = dividendReport(portfolio, { ARIS: profile }).holdings[0];
    expect(h.streak).toBeGreaterThanOrEqual(25);
    expect(h.safety).toBeGreaterThan(80);
    expect(h.safetyTone).toBe("safe");
    expect(h.cuts10y).toBe(0);
  });

  it("punishes a stretched payout, uncovered FCF, a recent cut, and a trap yield", () => {
    const profile = quarterlyProfile(
      "RISK",
      2015,
      2024,
      // Rising, then a sharp cut in the final year.
      (y) => (y === 2024 ? 0.5 : 1 + (y - 2015) * 0.02),
      {
        payoutRatio: 1.05, // > 0.95 → −25 and a flag
        fcfPayout: 1.2, // ≥ 1 → not covered by FCF, flag
        forwardRate: 12, // vs $100 price → 12% yield → trap territory
      }
    );
    const portfolio = makePortfolio([holding({ symbol: "RISK", shares: 100, price: 100 })]);
    const h = dividendReport(portfolio, { RISK: profile }).holdings[0];
    expect(h.cuts10y).toBeGreaterThanOrEqual(1);
    expect(h.currentYield!).toBeGreaterThan(0.08);
    expect(h.safetyTone).toBe("risk");
    expect(h.flags.some((f) => /yield trap/i.test(f))).toBe(true);
    expect(h.flags).toContain("Dividend is not covered by free cash flow");
  });

  it("judges a REIT on cash flow, not its GAAP payout ratio", () => {
    // Drive sector via a live patch so the engine sees Real Estate.
    const portfolio = buildPortfolio(
      [holding({ symbol: "REIT", shares: 100, price: 100 })],
      0,
      "2026-06-10T00:00:00.000Z",
      { patches: { REIT: { symbol: "REIT", asOf: "2026-06-10", sector: "Real Estate" } } }
    );
    const profile = quarterlyProfile("REIT", 2015, 2024, () => 4, {
      payoutRatio: 1.5, // catastrophic on GAAP — must be ignored for a REIT
      fcfPayout: 0.7,
    });
    const h = dividendReport(portfolio, { REIT: profile }).holdings[0];
    expect(h.sector).toBe("Real Estate");
    expect(h.safetyNotes.some((n) => /REIT/.test(n))).toBe(true);
    // GAAP payout ratio is surfaced but not penalized into the risk band.
    expect(h.safetyTone).not.toBe("risk");
  });

  it("treats a fund distribution as a pass-through (no payout-ratio math)", () => {
    const profile = quarterlyProfile("FUNDX", 2015, 2024, () => 2, { kind: "fund" });
    const portfolio = makePortfolio([holding({ symbol: "FUNDX", shares: 100, price: 100 })]);
    const h = dividendReport(portfolio, { FUNDX: profile }).holdings[0];
    expect(h.kind).toBe("fund");
    expect(h.payoutRatio).toBeNull();
    expect(h.fcfPayout).toBeNull();
    expect(h.safetyNotes.some((n) => /pass-through/.test(n))).toBe(true);
  });
});

describe("dividendReport — frequency & calendar layers", () => {
  it("infers a monthly cadence and spreads income across every month", () => {
    const events = [];
    for (let m = 1; m <= 12; m++) {
      events.push({ date: `2024-${String(m).padStart(2, "0")}-15`, amount: 0.1 });
    }
    const profile: DividendProfile = {
      symbol: "MNTH",
      asOf: "2024-12-31",
      kind: "stock",
      forwardRate: 1.2,
      payoutRatio: 0.5,
      fcfPayout: 0.6,
      events,
    };
    const portfolio = makePortfolio([holding({ symbol: "MNTH", shares: 100, price: 100 })]);
    const h = dividendReport(portfolio, { MNTH: profile }).holdings[0];
    expect(h.frequency).toBe("monthly");
  });

  it("flags calendar gaps when income clusters in a few months", () => {
    // Annual payer → income lands in one month, leaving the rest as gaps.
    const profile: DividendProfile = {
      symbol: "ANNL",
      asOf: "2024-12-31",
      kind: "stock",
      forwardRate: 5,
      payoutRatio: 0.5,
      fcfPayout: 0.6,
      events: [
        { date: "2022-06-15", amount: 4 },
        { date: "2023-06-15", amount: 4.5 },
        { date: "2024-06-15", amount: 5 },
      ],
    };
    const portfolio = makePortfolio([holding({ symbol: "ANNL", shares: 100, price: 100 })]);
    const report = dividendReport(portfolio, { ANNL: profile });
    expect(report.holdings[0].frequency).toBe("annual");
    expect(report.gapMonths.length).toBeGreaterThan(0);
    expect(report.evenness).not.toBeNull();
  });
});
