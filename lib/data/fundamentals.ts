import type {
  AnalystRating,
  Fundamentals,
  InsiderSignal,
  Sector,
} from "../types";

/**
 * Bundled fundamentals snapshot.
 *
 * These are point-in-time approximations (sector, growth, valuation, analyst
 * and insider posture) used so the app is fully functional offline. Price
 * targets are anchored to market prices as of the snapshot date (2026-06-10).
 * Edit this file — or wire a live provider — to refresh.
 */

interface Row {
  s: string; // symbol
  n: string; // name
  sec: Sector;
  ind: string; // industry
  cap: number; // market cap, $B
  beta: number;
  vol: number; // annualized volatility
  rg: number; // revenue growth (fwd/TTM blend)
  eg: number; // EPS growth (fwd)
  fg: number; // FCF growth
  pe: number | null; // forward P/E (null = unprofitable)
  fy: number; // FCF yield
  roic: number;
  om: number; // operating margin
  gm: number; // gross margin
  dy: number; // dividend yield
  r12: number; // trailing 12m return
  rt: AnalystRating;
  pt: number; // mean 12m price target
  ptl?: number;
  pth?: number;
  an?: number; // analyst count
  ins: InsiderSignal;
  insNet?: number; // net insider activity 6m, $M
  ed: string | null; // next earnings date
  eu?: number; // region revenue mix (US = remainder)
  ap?: number;
  em?: number;
  fundSec?: Partial<Record<Sector, number>>;
}

function mk(d: Row): Fundamentals {
  const eu = d.eu ?? 0;
  const ap = d.ap ?? 0;
  const em = d.em ?? 0;
  const us = Math.max(0, 1 - eu - ap - em);
  const seed =
    d.s.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 13;
  const insNet =
    d.insNet ??
    (d.ins === "Buying" ? 8 + seed : d.ins === "Selling" ? -(40 + seed * 14) : -(2 + seed));
  return {
    symbol: d.s,
    name: d.n,
    sector: d.sec,
    industry: d.ind,
    regions: { US: us, Europe: eu, "Asia-Pacific": ap, Emerging: em },
    marketCap: d.cap * 1e9,
    beta: d.beta,
    volatility: d.vol,
    revenueGrowth: d.rg,
    epsGrowth: d.eg,
    fcfGrowth: d.fg,
    forwardPE: d.pe,
    fcfYield: d.fy,
    roic: d.roic,
    operatingMargin: d.om,
    grossMargin: d.gm,
    dividendYield: d.dy,
    return12m: d.r12,
    analyst: {
      rating: d.rt,
      priceTarget: d.pt,
      targetLow: d.ptl ?? Math.round(d.pt * (0.74 + (seed % 5) * 0.015) * 100) / 100,
      targetHigh: d.pth ?? Math.round(d.pt * (1.22 + (seed % 7) * 0.02) * 100) / 100,
      count: d.an ?? 24 + seed,
    },
    insider: {
      signal: d.ins,
      netActivity6m: insNet * 1e6,
      buys6m: d.ins === "Buying" ? 6 + (seed % 5) : d.ins === "Neutral" ? 1 + (seed % 3) : seed % 2,
      sells6m: d.ins === "Selling" ? 9 + (seed % 6) : d.ins === "Neutral" ? 2 + (seed % 4) : 1 + (seed % 2),
    },
    earningsDate: d.ed,
    ...(d.fundSec ? { fund: { sectorWeights: d.fundSec } } : {}),
  };
}

const ROWS: Row[] = [
  // ───────────────────────── Mega-cap tech & platforms ─────────────────────────
  { s: "AAPL", n: "Apple", sec: "Technology", ind: "Consumer Electronics", cap: 4310, beta: 1.1, vol: 0.26, rg: 0.07, eg: 0.11, fg: 0.08, pe: 32.5, fy: 0.030, roic: 0.46, om: 0.32, gm: 0.47, dy: 0.004, r12: 0.21, rt: "Buy", pt: 318, an: 42, ins: "Selling", insNet: -180, ed: "2026-07-30", eu: 0.24, ap: 0.26, em: 0.08 },
  { s: "MSFT", n: "Microsoft", sec: "Technology", ind: "Software — Infrastructure", cap: 2950, beta: 1.0, vol: 0.25, rg: 0.13, eg: 0.14, fg: 0.12, pe: 26.8, fy: 0.026, roic: 0.28, om: 0.45, gm: 0.69, dy: 0.008, r12: -0.06, rt: "Strong Buy", pt: 472, an: 50, ins: "Selling", insNet: -95, ed: "2026-07-28", eu: 0.25, ap: 0.18, em: 0.07 },
  { s: "NVDA", n: "NVIDIA", sec: "Technology", ind: "Semiconductors", cap: 4880, beta: 1.9, vol: 0.45, rg: 0.38, eg: 0.36, fg: 0.34, pe: 27.0, fy: 0.024, roic: 0.78, om: 0.60, gm: 0.74, dy: 0.0003, r12: 0.32, rt: "Strong Buy", pt: 251, an: 55, ins: "Selling", insNet: -650, ed: "2026-08-26", eu: 0.12, ap: 0.34, em: 0.10 },
  { s: "GOOGL", n: "Alphabet (Class A)", sec: "Communication Services", ind: "Internet Content & Information", cap: 4320, beta: 1.1, vol: 0.29, rg: 0.13, eg: 0.16, fg: 0.13, pe: 28.5, fy: 0.022, roic: 0.30, om: 0.33, gm: 0.58, dy: 0.002, r12: 0.95, rt: "Strong Buy", pt: 410, an: 48, ins: "Selling", insNet: -240, ed: "2026-07-28", eu: 0.29, ap: 0.16, em: 0.09 },
  { s: "GOOG", n: "Alphabet (Class C)", sec: "Communication Services", ind: "Internet Content & Information", cap: 4320, beta: 1.1, vol: 0.29, rg: 0.13, eg: 0.16, fg: 0.13, pe: 28.3, fy: 0.022, roic: 0.30, om: 0.33, gm: 0.58, dy: 0.002, r12: 0.95, rt: "Strong Buy", pt: 407, an: 48, ins: "Selling", insNet: -240, ed: "2026-07-28", eu: 0.29, ap: 0.16, em: 0.09 },
  { s: "AMZN", n: "Amazon", sec: "Consumer Discretionary", ind: "Internet Retail", cap: 2530, beta: 1.3, vol: 0.31, rg: 0.11, eg: 0.21, fg: 0.18, pe: 29.0, fy: 0.022, roic: 0.16, om: 0.12, gm: 0.50, dy: 0, r12: 0.10, rt: "Strong Buy", pt: 295, an: 52, ins: "Selling", insNet: -310, ed: "2026-07-30", eu: 0.22, ap: 0.08, em: 0.05 },
  { s: "META", n: "Meta Platforms", sec: "Communication Services", ind: "Internet Content & Information", cap: 1440, beta: 1.25, vol: 0.34, rg: 0.15, eg: 0.13, fg: 0.07, pe: 19.8, fy: 0.033, roic: 0.30, om: 0.41, gm: 0.81, dy: 0.004, r12: -0.13, rt: "Buy", pt: 705, an: 50, ins: "Selling", insNet: -420, ed: "2026-07-29", eu: 0.23, ap: 0.20, em: 0.14 },
  { s: "TSLA", n: "Tesla", sec: "Consumer Discretionary", ind: "Auto Manufacturers", cap: 1230, beta: 2.0, vol: 0.55, rg: 0.12, eg: 0.25, fg: 0.15, pe: 92.0, fy: 0.006, roic: 0.09, om: 0.07, gm: 0.18, dy: 0, r12: 0.30, rt: "Hold", pt: 372, ptl: 150, pth: 600, an: 40, ins: "Selling", insNet: -150, ed: "2026-07-22", eu: 0.18, ap: 0.22, em: 0.04 },
  { s: "AVGO", n: "Broadcom", sec: "Technology", ind: "Semiconductors", cap: 1750, beta: 1.3, vol: 0.36, rg: 0.24, eg: 0.27, fg: 0.24, pe: 39.0, fy: 0.021, roic: 0.24, om: 0.45, gm: 0.66, dy: 0.007, r12: 0.55, rt: "Strong Buy", pt: 455, an: 38, ins: "Selling", insNet: -120, ed: "2026-09-03", eu: 0.10, ap: 0.42, em: 0.08 },
  { s: "ORCL", n: "Oracle", sec: "Technology", ind: "Software — Infrastructure", cap: 575, beta: 1.2, vol: 0.38, rg: 0.18, eg: 0.16, fg: -0.10, pe: 27.5, fy: 0.004, roic: 0.15, om: 0.30, gm: 0.70, dy: 0.010, r12: 0.05, rt: "Buy", pt: 255, an: 36, ins: "Selling", insNet: -200, ed: "2026-06-16", eu: 0.22, ap: 0.14, em: 0.06 },
  { s: "CRM", n: "Salesforce", sec: "Technology", ind: "Software — Application", cap: 163, beta: 1.25, vol: 0.33, rg: 0.08, eg: 0.11, fg: 0.10, pe: 14.5, fy: 0.075, roic: 0.12, om: 0.21, gm: 0.77, dy: 0.010, r12: -0.35, rt: "Buy", pt: 235, an: 45, ins: "Neutral", ed: "2026-08-26", eu: 0.23, ap: 0.10, em: 0.04 },
  { s: "ADBE", n: "Adobe", sec: "Technology", ind: "Software — Application", cap: 100, beta: 1.2, vol: 0.32, rg: 0.09, eg: 0.12, fg: 0.10, pe: 10.8, fy: 0.090, roic: 0.32, om: 0.36, gm: 0.89, dy: 0, r12: -0.42, rt: "Buy", pt: 310, an: 36, ins: "Buying", insNet: 22, ed: "2026-06-12", eu: 0.26, ap: 0.15, em: 0.04 },
  { s: "NOW", n: "ServiceNow", sec: "Technology", ind: "Software — Application", cap: 222, beta: 1.3, vol: 0.34, rg: 0.19, eg: 0.22, fg: 0.20, pe: 41.0, fy: 0.018, roic: 0.13, om: 0.13, gm: 0.79, dy: 0, r12: -0.08, rt: "Strong Buy", pt: 132, an: 42, ins: "Selling", insNet: -60, ed: "2026-07-22", eu: 0.20, ap: 0.10, em: 0.04 },
  { s: "INTU", n: "Intuit", sec: "Technology", ind: "Software — Application", cap: 79, beta: 1.2, vol: 0.31, rg: 0.12, eg: 0.14, fg: 0.13, pe: 13.5, fy: 0.068, roic: 0.20, om: 0.25, gm: 0.80, dy: 0.014, r12: -0.50, rt: "Buy", pt: 360, an: 30, ins: "Neutral", ed: "2026-08-20", eu: 0.04, ap: 0.02 },
  { s: "IBM", n: "IBM", sec: "Technology", ind: "IT Services", cap: 252, beta: 0.8, vol: 0.24, rg: 0.05, eg: 0.07, fg: 0.06, pe: 22.5, fy: 0.048, roic: 0.10, om: 0.17, gm: 0.57, dy: 0.025, r12: 0.10, rt: "Hold", pt: 290, an: 22, ins: "Neutral", ed: "2026-07-22", eu: 0.32, ap: 0.18, em: 0.06 },
  { s: "CSCO", n: "Cisco Systems", sec: "Technology", ind: "Communication Equipment", cap: 470, beta: 0.9, vol: 0.23, rg: 0.06, eg: 0.08, fg: 0.07, pe: 26.0, fy: 0.033, roic: 0.13, om: 0.27, gm: 0.65, dy: 0.014, r12: 0.68, rt: "Buy", pt: 128, an: 28, ins: "Selling", insNet: -45, ed: "2026-08-12", eu: 0.26, ap: 0.18, em: 0.06 },

  // ───────────────────────── Semis & hardware supply chain ─────────────────────────
  { s: "AMD", n: "Advanced Micro Devices", sec: "Technology", ind: "Semiconductors", cap: 735, beta: 1.8, vol: 0.48, rg: 0.30, eg: 0.42, fg: 0.38, pe: 38.0, fy: 0.012, roic: 0.14, om: 0.24, gm: 0.54, dy: 0, r12: 2.40, rt: "Buy", pt: 510, ptl: 280, pth: 700, an: 46, ins: "Selling", insNet: -210, ed: "2026-08-04", eu: 0.18, ap: 0.36, em: 0.08 },
  { s: "TSM", n: "Taiwan Semiconductor", sec: "Technology", ind: "Semiconductors", cap: 2120, beta: 1.3, vol: 0.34, rg: 0.24, eg: 0.26, fg: 0.22, pe: 24.5, fy: 0.028, roic: 0.26, om: 0.46, gm: 0.58, dy: 0.012, r12: 1.10, rt: "Strong Buy", pt: 495, an: 36, ins: "Neutral", ed: "2026-07-16", eu: 0.06, ap: 0.82, em: 0.02 },
  { s: "ASML", n: "ASML Holding", sec: "Technology", ind: "Semiconductor Equipment", cap: 680, beta: 1.4, vol: 0.36, rg: 0.15, eg: 0.18, fg: 0.16, pe: 32.0, fy: 0.024, roic: 0.26, om: 0.34, gm: 0.52, dy: 0.008, r12: 1.05, rt: "Buy", pt: 2000, an: 32, ins: "Neutral", ed: "2026-07-15", eu: 0.60, ap: 0.36, em: 0.02 },
  { s: "AMAT", n: "Applied Materials", sec: "Technology", ind: "Semiconductor Equipment", cap: 398, beta: 1.5, vol: 0.38, rg: 0.12, eg: 0.14, fg: 0.12, pe: 30.0, fy: 0.024, roic: 0.27, om: 0.30, gm: 0.48, dy: 0.004, r12: 1.65, rt: "Buy", pt: 545, an: 32, ins: "Selling", insNet: -75, ed: "2026-08-13", eu: 0.08, ap: 0.74, em: 0.04 },
  { s: "MU", n: "Micron Technology", sec: "Technology", ind: "Semiconductors — Memory", cap: 1000, beta: 1.7, vol: 0.52, rg: 0.55, eg: 0.85, fg: 0.60, pe: 14.5, fy: 0.030, roic: 0.22, om: 0.38, gm: 0.45, dy: 0.001, r12: 6.0, rt: "Buy", pt: 1010, ptl: 600, pth: 1400, an: 38, ins: "Selling", insNet: -180, ed: "2026-06-24", eu: 0.10, ap: 0.52, em: 0.06 },
  { s: "QCOM", n: "Qualcomm", sec: "Technology", ind: "Semiconductors", cap: 208, beta: 1.3, vol: 0.34, rg: 0.08, eg: 0.09, fg: 0.08, pe: 14.5, fy: 0.058, roic: 0.26, om: 0.27, gm: 0.56, dy: 0.018, r12: 0.25, rt: "Hold", pt: 215, an: 32, ins: "Neutral", ed: "2026-07-29", eu: 0.06, ap: 0.62, em: 0.10 },
  { s: "TXN", n: "Texas Instruments", sec: "Technology", ind: "Semiconductors — Analog", cap: 257, beta: 1.1, vol: 0.28, rg: 0.10, eg: 0.13, fg: 0.18, pe: 32.0, fy: 0.022, roic: 0.20, om: 0.36, gm: 0.59, dy: 0.019, r12: 0.42, rt: "Hold", pt: 295, an: 30, ins: "Neutral", ed: "2026-07-21", eu: 0.10, ap: 0.55, em: 0.10 },
  { s: "ARM", n: "Arm Holdings", sec: "Technology", ind: "Semiconductors — IP", cap: 325, beta: 1.9, vol: 0.55, rg: 0.24, eg: 0.30, fg: 0.26, pe: 70.0, fy: 0.008, roic: 0.14, om: 0.22, gm: 0.96, dy: 0, r12: 1.30, rt: "Hold", pt: 320, ptl: 180, pth: 480, an: 30, ins: "Selling", insNet: -90, ed: "2026-07-29", eu: 0.18, ap: 0.48, em: 0.06 },
  { s: "MRVL", n: "Marvell Technology", sec: "Technology", ind: "Semiconductors", cap: 220, beta: 1.8, vol: 0.50, rg: 0.30, eg: 0.45, fg: 0.40, pe: 32.0, fy: 0.014, roic: 0.10, om: 0.22, gm: 0.60, dy: 0.002, r12: 2.20, rt: "Buy", pt: 300, an: 34, ins: "Selling", insNet: -85, ed: "2026-08-27", eu: 0.10, ap: 0.55, em: 0.08 },
  { s: "INTC", n: "Intel", sec: "Technology", ind: "Semiconductors", cap: 470, beta: 1.4, vol: 0.48, rg: 0.08, eg: 0.60, fg: 0.30, pe: 60.0, fy: 0.004, roic: 0.03, om: 0.06, gm: 0.36, dy: 0, r12: 3.40, rt: "Hold", pt: 95, ptl: 50, pth: 140, an: 38, ins: "Buying", insNet: 35, ed: "2026-07-23", eu: 0.14, ap: 0.50, em: 0.06 },
  { s: "ANET", n: "Arista Networks", sec: "Technology", ind: "Communication Equipment", cap: 190, beta: 1.5, vol: 0.42, rg: 0.22, eg: 0.20, fg: 0.18, pe: 38.0, fy: 0.020, roic: 0.30, om: 0.42, gm: 0.64, dy: 0, r12: 0.60, rt: "Buy", pt: 172, an: 28, ins: "Selling", insNet: -110, ed: "2026-08-04", eu: 0.16, ap: 0.14, em: 0.04 },
  { s: "SMCI", n: "Super Micro Computer", sec: "Technology", ind: "Computer Hardware", cap: 17, beta: 2.1, vol: 0.75, rg: 0.10, eg: -0.10, fg: -0.20, pe: 11.0, fy: 0.020, roic: 0.12, om: 0.06, gm: 0.11, dy: 0, r12: -0.35, rt: "Hold", pt: 38, ptl: 18, pth: 70, an: 18, ins: "Selling", insNet: -55, ed: "2026-08-05", eu: 0.10, ap: 0.22, em: 0.04 },
  { s: "VRT", n: "Vertiv Holdings", sec: "Industrials", ind: "Electrical Equipment — Data Centers", cap: 107, beta: 1.8, vol: 0.52, rg: 0.22, eg: 0.28, fg: 0.24, pe: 34.0, fy: 0.018, roic: 0.20, om: 0.18, gm: 0.36, dy: 0.001, r12: 1.65, rt: "Buy", pt: 330, an: 24, ins: "Selling", insNet: -70, ed: "2026-07-23", eu: 0.22, ap: 0.18, em: 0.06 },
  { s: "APH", n: "Amphenol", sec: "Technology", ind: "Electronic Components", cap: 181, beta: 1.3, vol: 0.30, rg: 0.16, eg: 0.18, fg: 0.16, pe: 34.0, fy: 0.022, roic: 0.22, om: 0.22, gm: 0.34, dy: 0.006, r12: 1.20, rt: "Buy", pt: 168, an: 24, ins: "Selling", insNet: -65, ed: "2026-07-22", eu: 0.20, ap: 0.30, em: 0.08 },
  { s: "DELL", n: "Dell Technologies", sec: "Technology", ind: "Computer Hardware", cap: 105, beta: 1.3, vol: 0.42, rg: 0.12, eg: 0.15, fg: 0.12, pe: 14.0, fy: 0.052, roic: 0.20, om: 0.07, gm: 0.22, dy: 0.012, r12: 0.30, rt: "Buy", pt: 175, an: 24, ins: "Selling", insNet: -120, ed: "2026-08-27", eu: 0.20, ap: 0.18, em: 0.08 },

  // ───────────────────────── Software / cyber / data ─────────────────────────
  { s: "PLTR", n: "Palantir Technologies", sec: "Technology", ind: "Software — Analytics", cap: 312, beta: 2.3, vol: 0.62, rg: 0.34, eg: 0.32, fg: 0.30, pe: 165.0, fy: 0.005, roic: 0.12, om: 0.16, gm: 0.80, dy: 0, r12: -0.10, rt: "Hold", pt: 120, ptl: 45, pth: 200, an: 26, ins: "Selling", insNet: -800, ed: "2026-08-04", eu: 0.16, ap: 0.06, em: 0.02 },
  { s: "CRWD", n: "CrowdStrike", sec: "Technology", ind: "Software — Cybersecurity", cap: 160, beta: 1.5, vol: 0.42, rg: 0.21, eg: 0.24, fg: 0.22, pe: 95.0, fy: 0.012, roic: 0.06, om: 0.03, gm: 0.75, dy: 0, r12: 0.55, rt: "Buy", pt: 690, an: 44, ins: "Selling", insNet: -130, ed: "2026-08-27", eu: 0.16, ap: 0.10, em: 0.03 },
  { s: "PANW", n: "Palo Alto Networks", sec: "Technology", ind: "Software — Cybersecurity", cap: 175, beta: 1.2, vol: 0.36, rg: 0.15, eg: 0.15, fg: 0.14, pe: 52.0, fy: 0.019, roic: 0.08, om: 0.10, gm: 0.74, dy: 0, r12: 0.35, rt: "Buy", pt: 295, an: 46, ins: "Selling", insNet: -95, ed: "2026-08-18", eu: 0.20, ap: 0.12, em: 0.04 },
  { s: "SNOW", n: "Snowflake", sec: "Technology", ind: "Software — Data Cloud", cap: 80, beta: 1.6, vol: 0.50, rg: 0.24, eg: 0.30, fg: 0.26, pe: 140.0, fy: 0.010, roic: -0.02, om: -0.30, gm: 0.67, dy: 0, r12: 0.10, rt: "Buy", pt: 275, an: 42, ins: "Selling", insNet: -140, ed: "2026-08-26", eu: 0.16, ap: 0.08, em: 0.02 },
  { s: "DDOG", n: "Datadog", sec: "Technology", ind: "Software — Observability", cap: 80, beta: 1.5, vol: 0.46, rg: 0.22, eg: 0.20, fg: 0.20, pe: 60.0, fy: 0.014, roic: 0.05, om: 0.02, gm: 0.80, dy: 0, r12: 0.75, rt: "Buy", pt: 260, an: 40, ins: "Selling", insNet: -85, ed: "2026-08-06", eu: 0.20, ap: 0.08, em: 0.02 },
  { s: "NET", n: "Cloudflare", sec: "Technology", ind: "Software — Edge Network", cap: 76, beta: 1.7, vol: 0.55, rg: 0.27, eg: 0.35, fg: 0.30, pe: 170.0, fy: 0.005, roic: 0.01, om: -0.08, gm: 0.77, dy: 0, r12: 0.40, rt: "Hold", pt: 235, an: 36, ins: "Selling", insNet: -160, ed: "2026-07-30", eu: 0.22, ap: 0.10, em: 0.03 },
  { s: "SHOP", n: "Shopify", sec: "Technology", ind: "Software — E-Commerce", cap: 140, beta: 1.9, vol: 0.52, rg: 0.24, eg: 0.28, fg: 0.24, pe: 60.0, fy: 0.012, roic: 0.08, om: 0.12, gm: 0.50, dy: 0, r12: -0.05, rt: "Buy", pt: 135, an: 40, ins: "Selling", insNet: -75, ed: "2026-08-05", eu: 0.16, ap: 0.06, em: 0.04 },

  // ───────────────────────── Financials & fintech ─────────────────────────
  { s: "JPM", n: "JPMorgan Chase", sec: "Financials", ind: "Banks — Diversified", cap: 855, beta: 1.0, vol: 0.24, rg: 0.05, eg: 0.07, fg: 0.05, pe: 15.0, fy: 0.060, roic: 0.16, om: 0.40, gm: 1.0, dy: 0.019, r12: 0.22, rt: "Buy", pt: 335, an: 26, ins: "Selling", insNet: -85, ed: "2026-07-14", eu: 0.12, ap: 0.06, em: 0.05 },
  { s: "BAC", n: "Bank of America", sec: "Financials", ind: "Banks — Diversified", cap: 415, beta: 1.1, vol: 0.27, rg: 0.05, eg: 0.10, fg: 0.06, pe: 12.5, fy: 0.070, roic: 0.11, om: 0.32, gm: 1.0, dy: 0.020, r12: 0.18, rt: "Buy", pt: 60, an: 24, ins: "Neutral", ed: "2026-07-15", eu: 0.06, ap: 0.04, em: 0.03 },
  { s: "GS", n: "Goldman Sachs", sec: "Financials", ind: "Capital Markets", cap: 300, beta: 1.3, vol: 0.29, rg: 0.08, eg: 0.12, fg: 0.08, pe: 15.5, fy: 0.058, roic: 0.13, om: 0.35, gm: 1.0, dy: 0.012, r12: 0.55, rt: "Buy", pt: 1090, an: 24, ins: "Selling", insNet: -60, ed: "2026-07-15", eu: 0.16, ap: 0.10, em: 0.04 },
  { s: "BLK", n: "BlackRock", sec: "Financials", ind: "Asset Management", cap: 157, beta: 1.2, vol: 0.26, rg: 0.10, eg: 0.11, fg: 0.09, pe: 19.5, fy: 0.048, roic: 0.10, om: 0.37, gm: 0.49, dy: 0.021, r12: -0.02, rt: "Buy", pt: 1170, an: 18, ins: "Neutral", ed: "2026-07-15", eu: 0.22, ap: 0.08, em: 0.05 },
  { s: "SPGI", n: "S&P Global", sec: "Financials", ind: "Financial Data & Ratings", cap: 133, beta: 1.1, vol: 0.25, rg: 0.08, eg: 0.11, fg: 0.10, pe: 24.0, fy: 0.038, roic: 0.14, om: 0.40, gm: 0.69, dy: 0.009, r12: -0.13, rt: "Strong Buy", pt: 505, an: 22, ins: "Neutral", ed: "2026-07-30", eu: 0.22, ap: 0.10, em: 0.06 },
  { s: "V", n: "Visa", sec: "Financials", ind: "Payments Networks", cap: 640, beta: 0.95, vol: 0.22, rg: 0.10, eg: 0.13, fg: 0.11, pe: 25.5, fy: 0.034, roic: 0.30, om: 0.67, gm: 0.80, dy: 0.008, r12: 0.10, rt: "Strong Buy", pt: 388, an: 38, ins: "Selling", insNet: -55, ed: "2026-07-28", eu: 0.22, ap: 0.16, em: 0.12 },
  { s: "MA", n: "Mastercard", sec: "Financials", ind: "Payments Networks", cap: 445, beta: 1.05, vol: 0.24, rg: 0.12, eg: 0.15, fg: 0.13, pe: 28.5, fy: 0.030, roic: 0.45, om: 0.58, gm: 0.76, dy: 0.006, r12: 0.06, rt: "Strong Buy", pt: 590, an: 40, ins: "Selling", insNet: -70, ed: "2026-07-30", eu: 0.30, ap: 0.16, em: 0.14 },
  { s: "AXP", n: "American Express", sec: "Financials", ind: "Consumer Credit", cap: 220, beta: 1.2, vol: 0.27, rg: 0.09, eg: 0.13, fg: 0.10, pe: 19.0, fy: 0.048, roic: 0.14, om: 0.20, gm: 0.55, dy: 0.011, r12: 0.05, rt: "Buy", pt: 345, an: 28, ins: "Neutral", ed: "2026-07-17", eu: 0.10, ap: 0.06, em: 0.04 },
  { s: "COIN", n: "Coinbase", sec: "Financials", ind: "Crypto Exchange", cap: 39, beta: 2.5, vol: 0.78, rg: -0.05, eg: -0.20, fg: -0.15, pe: 28.0, fy: 0.030, roic: 0.08, om: 0.18, gm: 0.86, dy: 0, r12: -0.45, rt: "Hold", pt: 195, ptl: 90, pth: 320, an: 30, ins: "Selling", insNet: -260, ed: "2026-07-30", eu: 0.12, ap: 0.04, em: 0.04 },
  { s: "HOOD", n: "Robinhood Markets", sec: "Financials", ind: "Brokerage & Trading", cap: 76, beta: 2.2, vol: 0.65, rg: 0.28, eg: 0.30, fg: 0.26, pe: 38.0, fy: 0.018, roic: 0.12, om: 0.35, gm: 0.85, dy: 0, r12: 0.05, rt: "Buy", pt: 105, ptl: 55, pth: 160, an: 22, ins: "Selling", insNet: -190, ed: "2026-08-05", eu: 0.04 },
  { s: "PYPL", n: "PayPal Holdings", sec: "Financials", ind: "Payments — Digital", cap: 40, beta: 1.4, vol: 0.38, rg: 0.04, eg: 0.08, fg: 0.06, pe: 7.5, fy: 0.130, roic: 0.14, om: 0.18, gm: 0.46, dy: 0, r12: -0.42, rt: "Hold", pt: 58, an: 40, ins: "Buying", insNet: 18, ed: "2026-07-28", eu: 0.22, ap: 0.08, em: 0.05 },
  { s: "SOFI", n: "SoFi Technologies", sec: "Financials", ind: "Fintech — Lending", cap: 18, beta: 2.0, vol: 0.60, rg: 0.22, eg: 0.40, fg: 0.30, pe: 28.0, fy: 0.012, roic: 0.05, om: 0.12, gm: 0.80, dy: 0, r12: 0.10, rt: "Hold", pt: 19, an: 20, ins: "Buying", insNet: 12, ed: "2026-07-28" },
  { s: "MSTR", n: "Strategy (MicroStrategy)", sec: "Technology", ind: "Bitcoin Treasury / Software", cap: 33, beta: 3.2, vol: 0.95, rg: 0.02, eg: 0.0, fg: -0.05, pe: null, fy: 0.001, roic: 0.01, om: -0.02, gm: 0.72, dy: 0, r12: -0.70, rt: "Hold", pt: 160, ptl: 60, pth: 320, an: 14, ins: "Selling", insNet: -90, ed: "2026-07-29" },
  { s: "BRK.B", n: "Berkshire Hathaway (B)", sec: "Financials", ind: "Diversified Holding", cap: 1040, beta: 0.85, vol: 0.18, rg: 0.05, eg: 0.07, fg: 0.06, pe: 23.0, fy: 0.045, roic: 0.10, om: 0.18, gm: 0.30, dy: 0, r12: 0.06, rt: "Hold", pt: 525, an: 8, ins: "Neutral", ed: "2026-08-01" },

  // ───────────────────────── Health care ─────────────────────────
  { s: "LLY", n: "Eli Lilly", sec: "Health Care", ind: "Pharmaceuticals — GLP-1", cap: 1075, beta: 0.6, vol: 0.30, rg: 0.22, eg: 0.28, fg: 0.30, pe: 33.0, fy: 0.018, roic: 0.32, om: 0.42, gm: 0.82, dy: 0.006, r12: 0.32, rt: "Strong Buy", pt: 1290, an: 30, ins: "Neutral", ed: "2026-08-06", eu: 0.18, ap: 0.10, em: 0.08 },
  { s: "UNH", n: "UnitedHealth Group", sec: "Health Care", ind: "Managed Care", cap: 370, beta: 0.7, vol: 0.30, rg: 0.07, eg: 0.10, fg: 0.08, pe: 14.5, fy: 0.065, roic: 0.14, om: 0.08, gm: 0.24, dy: 0.021, r12: 0.32, rt: "Buy", pt: 470, an: 26, ins: "Buying", insNet: 45, ed: "2026-07-15" },
  { s: "JNJ", n: "Johnson & Johnson", sec: "Health Care", ind: "Pharma & MedTech", cap: 575, beta: 0.55, vol: 0.18, rg: 0.05, eg: 0.07, fg: 0.06, pe: 19.5, fy: 0.042, roic: 0.18, om: 0.27, gm: 0.69, dy: 0.022, r12: 0.55, rt: "Buy", pt: 255, an: 24, ins: "Neutral", ed: "2026-07-16", eu: 0.24, ap: 0.12, em: 0.08 },
  { s: "ABBV", n: "AbbVie", sec: "Health Care", ind: "Pharmaceuticals", cap: 397, beta: 0.6, vol: 0.22, rg: 0.06, eg: 0.10, fg: 0.08, pe: 16.0, fy: 0.050, roic: 0.20, om: 0.32, gm: 0.70, dy: 0.029, r12: 0.20, rt: "Buy", pt: 245, an: 26, ins: "Neutral", ed: "2026-07-31", eu: 0.20, ap: 0.08, em: 0.06 },
  { s: "MRK", n: "Merck & Co.", sec: "Health Care", ind: "Pharmaceuticals", cap: 300, beta: 0.5, vol: 0.22, rg: 0.04, eg: 0.07, fg: 0.06, pe: 12.5, fy: 0.062, roic: 0.20, om: 0.30, gm: 0.76, dy: 0.027, r12: 0.45, rt: "Buy", pt: 132, an: 26, ins: "Neutral", ed: "2026-07-29", eu: 0.22, ap: 0.14, em: 0.10 },
  { s: "PFE", n: "Pfizer", sec: "Health Care", ind: "Pharmaceuticals", cap: 145, beta: 0.6, vol: 0.24, rg: 0.01, eg: 0.04, fg: 0.03, pe: 8.5, fy: 0.095, roic: 0.08, om: 0.24, gm: 0.72, dy: 0.066, r12: 0.05, rt: "Hold", pt: 30, an: 22, ins: "Buying", insNet: 15, ed: "2026-07-29", eu: 0.24, ap: 0.12, em: 0.12 },
  { s: "NVO", n: "Novo Nordisk", sec: "Health Care", ind: "Pharmaceuticals — GLP-1", cap: 190, beta: 0.8, vol: 0.34, rg: 0.10, eg: 0.12, fg: 0.10, pe: 11.0, fy: 0.072, roic: 0.50, om: 0.44, gm: 0.84, dy: 0.026, r12: -0.30, rt: "Buy", pt: 56, an: 28, ins: "Buying", insNet: 30, ed: "2026-08-06", eu: 0.62, ap: 0.06, em: 0.08 },
  { s: "ISRG", n: "Intuitive Surgical", sec: "Health Care", ind: "Medical Devices — Robotics", cap: 147, beta: 1.2, vol: 0.30, rg: 0.14, eg: 0.16, fg: 0.14, pe: 47.0, fy: 0.016, roic: 0.20, om: 0.28, gm: 0.67, dy: 0, r12: -0.18, rt: "Buy", pt: 495, an: 28, ins: "Selling", insNet: -65, ed: "2026-07-17", eu: 0.16, ap: 0.12, em: 0.06 },
  { s: "ABT", n: "Abbott Laboratories", sec: "Health Care", ind: "Medical Devices & Diagnostics", cap: 230, beta: 0.7, vol: 0.20, rg: 0.07, eg: 0.10, fg: 0.08, pe: 23.0, fy: 0.038, roic: 0.15, om: 0.21, gm: 0.56, dy: 0.017, r12: 0.18, rt: "Buy", pt: 148, an: 24, ins: "Neutral", ed: "2026-07-17", eu: 0.20, ap: 0.16, em: 0.18 },

  // ───────────────────────── Consumer ─────────────────────────
  { s: "WMT", n: "Walmart", sec: "Consumer Staples", ind: "Discount Retail", cap: 960, beta: 0.7, vol: 0.22, rg: 0.05, eg: 0.11, fg: 0.09, pe: 41.0, fy: 0.018, roic: 0.15, om: 0.05, gm: 0.25, dy: 0.008, r12: 0.18, rt: "Strong Buy", pt: 134, an: 38, ins: "Selling", insNet: -130, ed: "2026-08-20", eu: 0.04, ap: 0.04, em: 0.10 },
  { s: "COST", n: "Costco Wholesale", sec: "Consumer Staples", ind: "Warehouse Clubs", cap: 436, beta: 0.85, vol: 0.22, rg: 0.07, eg: 0.10, fg: 0.08, pe: 49.0, fy: 0.016, roic: 0.23, om: 0.04, gm: 0.13, dy: 0.005, r12: 0.04, rt: "Buy", pt: 1085, an: 32, ins: "Selling", insNet: -40, ed: "2026-09-24", eu: 0.04, ap: 0.06, em: 0.04 },
  { s: "PG", n: "Procter & Gamble", sec: "Consumer Staples", ind: "Household Products", cap: 350, beta: 0.45, vol: 0.16, rg: 0.03, eg: 0.06, fg: 0.05, pe: 21.5, fy: 0.042, roic: 0.18, om: 0.24, gm: 0.51, dy: 0.028, r12: -0.08, rt: "Buy", pt: 165, an: 24, ins: "Neutral", ed: "2026-07-29", eu: 0.22, ap: 0.10, em: 0.16 },
  { s: "KO", n: "Coca-Cola", sec: "Consumer Staples", ind: "Beverages", cap: 361, beta: 0.5, vol: 0.16, rg: 0.05, eg: 0.07, fg: 0.06, pe: 26.5, fy: 0.034, roic: 0.22, om: 0.30, gm: 0.61, dy: 0.024, r12: 0.18, rt: "Buy", pt: 90, an: 26, ins: "Neutral", ed: "2026-07-21", eu: 0.20, ap: 0.16, em: 0.26 },
  { s: "PEP", n: "PepsiCo", sec: "Consumer Staples", ind: "Beverages & Snacks", cap: 198, beta: 0.5, vol: 0.17, rg: 0.03, eg: 0.05, fg: 0.04, pe: 17.0, fy: 0.044, roic: 0.16, om: 0.15, gm: 0.55, dy: 0.038, r12: 0.10, rt: "Hold", pt: 155, an: 22, ins: "Buying", insNet: 10, ed: "2026-07-14", eu: 0.18, ap: 0.10, em: 0.18 },
  { s: "HD", n: "Home Depot", sec: "Consumer Discretionary", ind: "Home Improvement Retail", cap: 317, beta: 1.0, vol: 0.23, rg: 0.04, eg: 0.06, fg: 0.05, pe: 20.5, fy: 0.044, roic: 0.28, om: 0.13, gm: 0.33, dy: 0.029, r12: -0.10, rt: "Buy", pt: 372, an: 32, ins: "Neutral", ed: "2026-08-18", eu: 0.02 },
  { s: "MCD", n: "McDonald's", sec: "Consumer Discretionary", ind: "Restaurants", cap: 202, beta: 0.7, vol: 0.18, rg: 0.04, eg: 0.07, fg: 0.06, pe: 22.5, fy: 0.038, roic: 0.22, om: 0.46, gm: 0.57, dy: 0.025, r12: -0.02, rt: "Buy", pt: 320, an: 30, ins: "Neutral", ed: "2026-07-28", eu: 0.28, ap: 0.14, em: 0.12 },
  { s: "SBUX", n: "Starbucks", sec: "Consumer Discretionary", ind: "Restaurants — Coffee", cap: 112, beta: 0.95, vol: 0.28, rg: 0.04, eg: 0.12, fg: 0.10, pe: 30.0, fy: 0.028, roic: 0.16, om: 0.12, gm: 0.27, dy: 0.025, r12: 0.08, rt: "Hold", pt: 105, an: 28, ins: "Neutral", ed: "2026-07-29", eu: 0.10, ap: 0.14, em: 0.10 },
  { s: "NKE", n: "Nike", sec: "Consumer Discretionary", ind: "Footwear & Apparel", cap: 65, beta: 1.1, vol: 0.34, rg: 0.01, eg: 0.10, fg: 0.08, pe: 24.0, fy: 0.040, roic: 0.14, om: 0.10, gm: 0.43, dy: 0.036, r12: -0.30, rt: "Hold", pt: 52, an: 32, ins: "Buying", insNet: 25, ed: "2026-06-25", eu: 0.26, ap: 0.20, em: 0.12 },
  { s: "DIS", n: "Walt Disney", sec: "Communication Services", ind: "Entertainment & Media", cap: 180, beta: 1.2, vol: 0.28, rg: 0.04, eg: 0.10, fg: 0.09, pe: 15.0, fy: 0.055, roic: 0.08, om: 0.13, gm: 0.36, dy: 0.011, r12: -0.16, rt: "Buy", pt: 124, an: 30, ins: "Buying", insNet: 18, ed: "2026-08-05", eu: 0.18, ap: 0.10, em: 0.06 },
  { s: "NFLX", n: "Netflix", sec: "Communication Services", ind: "Streaming Entertainment", cap: 345, beta: 1.25, vol: 0.32, rg: 0.13, eg: 0.21, fg: 0.18, pe: 28.0, fy: 0.028, roic: 0.24, om: 0.29, gm: 0.47, dy: 0, r12: -0.30, rt: "Buy", pt: 102, an: 44, ins: "Selling", insNet: -110, ed: "2026-07-16", eu: 0.30, ap: 0.14, em: 0.12 },
  { s: "BKNG", n: "Booking Holdings", sec: "Consumer Discretionary", ind: "Online Travel", cap: 53, beta: 1.2, vol: 0.27, rg: 0.09, eg: 0.14, fg: 0.12, pe: 16.5, fy: 0.062, roic: 0.32, om: 0.32, gm: 0.86, dy: 0.012, r12: -0.12, rt: "Buy", pt: 196, an: 34, ins: "Neutral", ed: "2026-07-29", eu: 0.46, ap: 0.12, em: 0.08 },
  { s: "UBER", n: "Uber Technologies", sec: "Industrials", ind: "Ride-Hailing & Delivery", cap: 144, beta: 1.4, vol: 0.38, rg: 0.16, eg: 0.25, fg: 0.22, pe: 20.5, fy: 0.052, roic: 0.14, om: 0.09, gm: 0.40, dy: 0, r12: -0.20, rt: "Strong Buy", pt: 92, an: 46, ins: "Selling", insNet: -95, ed: "2026-08-05", eu: 0.18, ap: 0.10, em: 0.12 },
  { s: "TGT", n: "Target", sec: "Consumer Staples", ind: "Discount Retail", cap: 48, beta: 1.1, vol: 0.32, rg: 0.01, eg: 0.06, fg: 0.05, pe: 11.5, fy: 0.078, roic: 0.13, om: 0.05, gm: 0.28, dy: 0.043, r12: -0.18, rt: "Hold", pt: 118, an: 30, ins: "Buying", insNet: 14, ed: "2026-08-19" },
  { s: "F", n: "Ford Motor", sec: "Consumer Discretionary", ind: "Auto Manufacturers", cap: 46, beta: 1.4, vol: 0.38, rg: 0.01, eg: 0.05, fg: 0.04, pe: 7.0, fy: 0.110, roic: 0.04, om: 0.03, gm: 0.09, dy: 0.052, r12: 0.12, rt: "Hold", pt: 12.5, an: 22, ins: "Buying", insNet: 12, ed: "2026-07-23", eu: 0.18, em: 0.08 },
  { s: "GM", n: "General Motors", sec: "Consumer Discretionary", ind: "Auto Manufacturers", cap: 55, beta: 1.3, vol: 0.36, rg: 0.02, eg: 0.07, fg: 0.05, pe: 6.0, fy: 0.130, roic: 0.07, om: 0.07, gm: 0.12, dy: 0.010, r12: 0.20, rt: "Buy", pt: 68, an: 24, ins: "Neutral", ed: "2026-07-21", em: 0.12 },
  { s: "LULU", n: "Lululemon Athletica", sec: "Consumer Discretionary", ind: "Athletic Apparel", cap: 28, beta: 1.3, vol: 0.40, rg: 0.04, eg: 0.06, fg: 0.05, pe: 15.5, fy: 0.058, roic: 0.28, om: 0.20, gm: 0.58, dy: 0, r12: -0.28, rt: "Hold", pt: 265, an: 28, ins: "Buying", insNet: 16, ed: "2026-09-03", eu: 0.08, ap: 0.16, em: 0.06 },

  // ───────────────────────── Industrials / energy / materials / utilities ─────────────────────────
  { s: "GE", n: "GE Aerospace", sec: "Industrials", ind: "Aerospace & Defense", cap: 340, beta: 1.2, vol: 0.30, rg: 0.16, eg: 0.20, fg: 0.18, pe: 42.0, fy: 0.020, roic: 0.24, om: 0.22, gm: 0.30, dy: 0.005, r12: 0.30, rt: "Buy", pt: 365, an: 24, ins: "Selling", insNet: -50, ed: "2026-07-22", eu: 0.26, ap: 0.16, em: 0.10 },
  { s: "CAT", n: "Caterpillar", sec: "Industrials", ind: "Construction Machinery", cap: 410, beta: 1.1, vol: 0.28, rg: 0.08, eg: 0.12, fg: 0.10, pe: 28.0, fy: 0.030, roic: 0.20, om: 0.20, gm: 0.32, dy: 0.008, r12: 1.20, rt: "Hold", pt: 880, an: 26, ins: "Selling", insNet: -85, ed: "2026-07-30", eu: 0.18, ap: 0.18, em: 0.16 },
  { s: "RKLB", n: "Rocket Lab", sec: "Industrials", ind: "Space & Launch", cap: 53, beta: 2.2, vol: 0.72, rg: 0.45, eg: 0.60, fg: 0.50, pe: null, fy: -0.005, roic: -0.05, om: -0.12, gm: 0.30, dy: 0, r12: 2.80, rt: "Buy", pt: 115, ptl: 50, pth: 180, an: 16, ins: "Selling", insNet: -120, ed: "2026-08-11" },
  { s: "LMT", n: "Lockheed Martin", sec: "Industrials", ind: "Aerospace & Defense", cap: 110, beta: 0.5, vol: 0.22, rg: 0.04, eg: 0.07, fg: 0.06, pe: 16.5, fy: 0.058, roic: 0.22, om: 0.11, gm: 0.13, dy: 0.028, r12: 0.05, rt: "Hold", pt: 510, an: 22, ins: "Neutral", ed: "2026-07-21", eu: 0.08, ap: 0.08, em: 0.08 },
  { s: "BA", n: "Boeing", sec: "Industrials", ind: "Aerospace & Defense", cap: 165, beta: 1.4, vol: 0.38, rg: 0.18, eg: 0.80, fg: 0.60, pe: 38.0, fy: 0.012, roic: 0.02, om: 0.03, gm: 0.12, dy: 0, r12: 0.22, rt: "Buy", pt: 255, an: 26, ins: "Neutral", ed: "2026-07-29", eu: 0.20, ap: 0.16, em: 0.10 },
  { s: "UNP", n: "Union Pacific", sec: "Industrials", ind: "Railroads", cap: 160, beta: 0.9, vol: 0.22, rg: 0.04, eg: 0.08, fg: 0.07, pe: 21.0, fy: 0.042, roic: 0.15, om: 0.40, gm: 0.55, dy: 0.021, r12: 0.15, rt: "Buy", pt: 295, an: 24, ins: "Neutral", ed: "2026-07-23" },
  { s: "DE", n: "Deere & Company", sec: "Industrials", ind: "Agricultural Machinery", cap: 145, beta: 1.0, vol: 0.27, rg: 0.05, eg: 0.10, fg: 0.08, pe: 22.0, fy: 0.036, roic: 0.18, om: 0.18, gm: 0.34, dy: 0.012, r12: 0.30, rt: "Buy", pt: 590, an: 22, ins: "Neutral", ed: "2026-08-13", eu: 0.16, em: 0.16 },
  { s: "XOM", n: "Exxon Mobil", sec: "Energy", ind: "Oil & Gas Integrated", cap: 640, beta: 0.85, vol: 0.24, rg: 0.03, eg: 0.06, fg: 0.05, pe: 15.5, fy: 0.058, roic: 0.12, om: 0.13, gm: 0.32, dy: 0.027, r12: 0.30, rt: "Buy", pt: 162, an: 26, ins: "Neutral", ed: "2026-07-31", eu: 0.14, ap: 0.16, em: 0.14 },
  { s: "CVX", n: "Chevron", sec: "Energy", ind: "Oil & Gas Integrated", cap: 340, beta: 0.9, vol: 0.25, rg: 0.03, eg: 0.07, fg: 0.06, pe: 16.0, fy: 0.056, roic: 0.11, om: 0.12, gm: 0.30, dy: 0.035, r12: 0.28, rt: "Buy", pt: 202, an: 24, ins: "Neutral", ed: "2026-08-01", eu: 0.10, ap: 0.18, em: 0.14 },
  { s: "COP", n: "ConocoPhillips", sec: "Energy", ind: "Oil & Gas E&P", cap: 125, beta: 1.1, vol: 0.30, rg: 0.02, eg: 0.06, fg: 0.05, pe: 13.0, fy: 0.070, roic: 0.13, om: 0.24, gm: 0.38, dy: 0.032, r12: 0.10, rt: "Buy", pt: 122, an: 24, ins: "Neutral", ed: "2026-08-06", ap: 0.16, em: 0.10 },
  { s: "LIN", n: "Linde", sec: "Materials", ind: "Industrial Gases", cap: 240, beta: 0.85, vol: 0.20, rg: 0.05, eg: 0.09, fg: 0.08, pe: 28.0, fy: 0.032, roic: 0.15, om: 0.28, gm: 0.48, dy: 0.012, r12: 0.16, rt: "Buy", pt: 565, an: 24, ins: "Neutral", ed: "2026-08-01", eu: 0.34, ap: 0.18, em: 0.10 },
  { s: "NEE", n: "NextEra Energy", sec: "Utilities", ind: "Electric Utilities — Renewables", cap: 175, beta: 0.6, vol: 0.24, rg: 0.07, eg: 0.08, fg: 0.07, pe: 21.5, fy: 0.030, roic: 0.07, om: 0.26, gm: 0.60, dy: 0.027, r12: 0.18, rt: "Buy", pt: 96, an: 22, ins: "Buying", insNet: 20, ed: "2026-07-23" },
  { s: "CEG", n: "Constellation Energy", sec: "Utilities", ind: "Electric Utilities — Nuclear", cap: 110, beta: 1.1, vol: 0.40, rg: 0.10, eg: 0.15, fg: 0.12, pe: 30.0, fy: 0.024, roic: 0.12, om: 0.18, gm: 0.30, dy: 0.005, r12: 0.55, rt: "Buy", pt: 395, an: 20, ins: "Selling", insNet: -45, ed: "2026-08-06" },
  { s: "OKLO", n: "Oklo", sec: "Utilities", ind: "Nuclear — SMR", cap: 16, beta: 2.6, vol: 0.95, rg: 0.0, eg: 0.0, fg: 0.0, pe: null, fy: -0.02, roic: -0.10, om: -1.0, gm: 0.0, dy: 0, r12: 1.40, rt: "Hold", pt: 60, ptl: 20, pth: 110, an: 12, ins: "Selling", insNet: -75, ed: "2026-08-12" },
  { s: "IONQ", n: "IonQ", sec: "Technology", ind: "Quantum Computing", cap: 18, beta: 2.8, vol: 1.05, rg: 0.80, eg: 0.0, fg: -0.10, pe: null, fy: -0.02, roic: -0.20, om: -2.5, gm: 0.55, dy: 0, r12: 0.65, rt: "Hold", pt: 62, ptl: 25, pth: 100, an: 10, ins: "Selling", insNet: -95, ed: "2026-08-12" },
  { s: "RDDT", n: "Reddit", sec: "Communication Services", ind: "Social Media", cap: 32, beta: 2.2, vol: 0.70, rg: 0.35, eg: 0.55, fg: 0.45, pe: 45.0, fy: 0.012, roic: 0.08, om: 0.12, gm: 0.90, dy: 0, r12: 0.20, rt: "Buy", pt: 235, ptl: 120, pth: 350, an: 24, ins: "Selling", insNet: -180, ed: "2026-08-04", eu: 0.16, ap: 0.06 },
  { s: "T", n: "AT&T", sec: "Communication Services", ind: "Telecom", cap: 165, beta: 0.6, vol: 0.20, rg: 0.01, eg: 0.04, fg: 0.04, pe: 10.0, fy: 0.095, roic: 0.07, om: 0.23, gm: 0.60, dy: 0.048, r12: 0.12, rt: "Buy", pt: 26, an: 24, ins: "Buying", insNet: 10, ed: "2026-07-23" },
  { s: "BABA", n: "Alibaba Group", sec: "Consumer Discretionary", ind: "E-Commerce — China", cap: 270, beta: 1.3, vol: 0.42, rg: 0.08, eg: 0.12, fg: 0.10, pe: 12.5, fy: 0.065, roic: 0.09, om: 0.14, gm: 0.40, dy: 0.011, r12: 0.05, rt: "Buy", pt: 145, an: 36, ins: "Buying", insNet: 240, ed: "2026-08-14", em: 0.90, ap: 0.06 },

  // ───────────────────────── ETFs (look-through treated as funds) ─────────────────────────
  { s: "SPY", n: "SPDR S&P 500 ETF", sec: "Diversified", ind: "Large Blend ETF", cap: 700, beta: 1.0, vol: 0.155, rg: 0.055, eg: 0.10, fg: 0.08, pe: 21.5, fy: 0.038, roic: 0.14, om: 0.16, gm: 0.45, dy: 0.012, r12: 0.10, rt: "Hold", pt: 800, an: 0, ins: "Neutral", insNet: 0, ed: null, eu: 0.0, ap: 0.0, em: 0.0, fundSec: { Technology: 0.34, "Communication Services": 0.10, "Consumer Discretionary": 0.105, Financials: 0.125, "Health Care": 0.105, Industrials: 0.085, "Consumer Staples": 0.055, Energy: 0.035, Utilities: 0.024, Materials: 0.02, "Real Estate": 0.021 } },
  { s: "VOO", n: "Vanguard S&P 500 ETF", sec: "Diversified", ind: "Large Blend ETF", cap: 1500, beta: 1.0, vol: 0.155, rg: 0.055, eg: 0.10, fg: 0.08, pe: 21.5, fy: 0.038, roic: 0.14, om: 0.16, gm: 0.45, dy: 0.012, r12: 0.10, rt: "Hold", pt: 735, an: 0, ins: "Neutral", insNet: 0, ed: null, fundSec: { Technology: 0.34, "Communication Services": 0.10, "Consumer Discretionary": 0.105, Financials: 0.125, "Health Care": 0.105, Industrials: 0.085, "Consumer Staples": 0.055, Energy: 0.035, Utilities: 0.024, Materials: 0.02, "Real Estate": 0.021 } },
  { s: "VTI", n: "Vanguard Total Stock Market ETF", sec: "Diversified", ind: "Total Market ETF", cap: 520, beta: 1.0, vol: 0.16, rg: 0.055, eg: 0.095, fg: 0.08, pe: 21.0, fy: 0.038, roic: 0.13, om: 0.15, gm: 0.44, dy: 0.013, r12: 0.09, rt: "Hold", pt: 395, an: 0, ins: "Neutral", insNet: 0, ed: null, fundSec: { Technology: 0.32, "Communication Services": 0.095, "Consumer Discretionary": 0.105, Financials: 0.135, "Health Care": 0.105, Industrials: 0.095, "Consumer Staples": 0.05, Energy: 0.035, Utilities: 0.025, Materials: 0.025, "Real Estate": 0.03 } },
  { s: "QQQ", n: "Invesco QQQ Trust", sec: "Diversified", ind: "NASDAQ-100 ETF", cap: 380, beta: 1.12, vol: 0.20, rg: 0.09, eg: 0.14, fg: 0.11, pe: 26.0, fy: 0.030, roic: 0.20, om: 0.24, gm: 0.55, dy: 0.005, r12: 0.12, rt: "Hold", pt: 770, an: 0, ins: "Neutral", insNet: 0, ed: null, fundSec: { Technology: 0.52, "Communication Services": 0.155, "Consumer Discretionary": 0.13, "Health Care": 0.06, "Consumer Staples": 0.06, Industrials: 0.05, Utilities: 0.015, Financials: 0.005, Energy: 0.005 } },
  { s: "VUG", n: "Vanguard Growth ETF", sec: "Diversified", ind: "Large Growth ETF", cap: 180, beta: 1.15, vol: 0.20, rg: 0.10, eg: 0.14, fg: 0.11, pe: 27.5, fy: 0.026, roic: 0.22, om: 0.26, gm: 0.55, dy: 0.005, r12: 0.11, rt: "Hold", pt: 93, an: 0, ins: "Neutral", insNet: 0, ed: null, fundSec: { Technology: 0.50, "Communication Services": 0.13, "Consumer Discretionary": 0.14, "Health Care": 0.06, Industrials: 0.06, Financials: 0.03, "Consumer Staples": 0.02 } },
  { s: "IWM", n: "iShares Russell 2000 ETF", sec: "Diversified", ind: "Small Blend ETF", cap: 70, beta: 1.15, vol: 0.22, rg: 0.04, eg: 0.09, fg: 0.07, pe: 16.5, fy: 0.045, roic: 0.08, om: 0.09, gm: 0.36, dy: 0.013, r12: 0.06, rt: "Hold", pt: 310, an: 0, ins: "Neutral", insNet: 0, ed: null, fundSec: { Financials: 0.19, Industrials: 0.17, "Health Care": 0.16, Technology: 0.14, "Consumer Discretionary": 0.10, Energy: 0.06, "Real Estate": 0.06, Materials: 0.04, "Consumer Staples": 0.03, Utilities: 0.03, "Communication Services": 0.02 } },
  { s: "SCHD", n: "Schwab US Dividend Equity ETF", sec: "Diversified", ind: "Dividend Value ETF", cap: 72, beta: 0.8, vol: 0.14, rg: 0.04, eg: 0.07, fg: 0.06, pe: 15.5, fy: 0.055, roic: 0.15, om: 0.18, gm: 0.42, dy: 0.037, r12: 0.02, rt: "Hold", pt: 36, an: 0, ins: "Neutral", insNet: 0, ed: null, fundSec: { Financials: 0.19, "Health Care": 0.155, "Consumer Staples": 0.14, Industrials: 0.12, Energy: 0.105, "Consumer Discretionary": 0.09, Technology: 0.09, "Communication Services": 0.05, Materials: 0.04, Utilities: 0.01 } },
  { s: "VXUS", n: "Vanguard Total International Stock ETF", sec: "Diversified", ind: "International ex-US ETF", cap: 110, beta: 0.85, vol: 0.15, rg: 0.045, eg: 0.08, fg: 0.06, pe: 14.5, fy: 0.052, roic: 0.10, om: 0.13, gm: 0.38, dy: 0.029, r12: 0.14, rt: "Hold", pt: 91, an: 0, ins: "Neutral", insNet: 0, ed: null, eu: 0.40, ap: 0.28, em: 0.25, fundSec: { Financials: 0.22, Industrials: 0.14, Technology: 0.13, "Consumer Discretionary": 0.11, "Health Care": 0.09, "Consumer Staples": 0.07, Materials: 0.07, Energy: 0.05, "Communication Services": 0.05, Utilities: 0.03, "Real Estate": 0.02 } },
];

const BY_SYMBOL = new Map(ROWS.map((r) => [r.s, mk(r)]));

// Alias common share-class / formatting variants.
const ALIASES: Record<string, string> = {
  "BRK-B": "BRK.B",
  BRKB: "BRK.B",
  "BRK/B": "BRK.B",
  FB: "META",
};

export function getFundamentals(symbol: string): Fundamentals | null {
  const key = ALIASES[symbol] ?? symbol;
  return BY_SYMBOL.get(key) ?? null;
}

export function knownSymbols(): string[] {
  return [...BY_SYMBOL.keys()];
}

/** Conservative defaults used in math (never displayed as real data) for unknown tickers. */
export const UNKNOWN_DEFAULTS = {
  beta: 1.0,
  volatility: 0.32,
  sector: "Unknown" as Sector,
  regions: { US: 1 } as Fundamentals["regions"],
};
