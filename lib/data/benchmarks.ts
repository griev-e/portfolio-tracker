import type { BenchmarkProfile } from "../types";

/**
 * Benchmark aggregate profiles, same snapshot date as fundamentals.
 * Factor scores use the same 0–100 scale as lib/analytics/factors.ts.
 */
export const SPX: BenchmarkProfile = {
  id: "spx",
  name: "S&P 500",
  ticker: "SPX",
  forwardPE: 21.5,
  revenueGrowth: 0.055,
  epsGrowth: 0.1,
  fcfGrowth: 0.08,
  roic: 0.14,
  operatingMargin: 0.16,
  grossMargin: 0.45,
  dividendYield: 0.0125,
  volatility: 0.155,
  beta: 1.0,
  return12m: 0.1,
  fcfYield: 0.038,
  sectorWeights: {
    Technology: 0.34,
    "Communication Services": 0.1,
    "Consumer Discretionary": 0.105,
    Financials: 0.125,
    "Health Care": 0.105,
    Industrials: 0.085,
    "Consumer Staples": 0.055,
    Energy: 0.035,
    Utilities: 0.024,
    Materials: 0.02,
    "Real Estate": 0.021,
  },
  factorScores: { growth: 52, value: 47, quality: 58, momentum: 53 },
};

export const NDX: BenchmarkProfile = {
  id: "ndx",
  name: "NASDAQ-100",
  ticker: "NDX",
  forwardPE: 26.0,
  revenueGrowth: 0.09,
  epsGrowth: 0.14,
  fcfGrowth: 0.11,
  roic: 0.2,
  operatingMargin: 0.24,
  grossMargin: 0.55,
  dividendYield: 0.005,
  volatility: 0.2,
  beta: 1.12,
  return12m: 0.12,
  fcfYield: 0.03,
  sectorWeights: {
    Technology: 0.52,
    "Communication Services": 0.155,
    "Consumer Discretionary": 0.13,
    "Health Care": 0.06,
    "Consumer Staples": 0.06,
    Industrials: 0.05,
    Utilities: 0.015,
    Financials: 0.005,
    Energy: 0.005,
  },
  factorScores: { growth: 68, value: 35, quality: 67, momentum: 58 },
};

/** Capital-market assumptions used by CAPM expected returns & Monte Carlo. */
export const CMA = {
  riskFree: 0.04, // 3m T-bill, snapshot
  equityRiskPremium: 0.045,
  marketVolatility: 0.16,
};
