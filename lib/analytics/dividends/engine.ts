import { clamp, mean } from "@/lib/analytics/mathUtils";
import { getAssumptions } from "@/lib/live/assumptions";
import type { Portfolio, Position } from "@/lib/types";
import type {
  DividendEvent,
  DividendGrade,
  DividendProfile,
  DividendReport,
  HoldingDividend,
  MonthIncome,
  PayFrequency,
  SafetyTone,
  ScenarioRow,
} from "./types";

/**
 * Dividend engine: joins per-symbol dividend profiles (history + safety
 * inputs from the provider) with the portfolio (shares, cost basis, sector)
 * and evaluates income quality, not just yield. Every score keeps the notes
 * that explain it.
 */

/** Median of a numeric list (average of the two middle values when even). */
const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

/**
 * Long-run S&P 500 dividend-growth anchor, used only as a comparison reference.
 * No live index source exists, so it's a user-editable market assumption.
 */
const spxDivGrowth = (): number => getAssumptions().dividendGrowth;

/* ── Per-symbol history math ─────────────────────────────────────────── */

/** Recognized payment cadences for count normalization. */
const FREQ_COUNTS = [1, 2, 4, 12];
const snapCount = (n: number): number =>
  FREQ_COUNTS.reduce(
    (best, c) => (Math.abs(c - n) < Math.abs(best - n) ? c : best),
    FREQ_COUNTS[0]
  );

/**
 * Per-share annual dividend *rate* by completed calendar year (oldest first):
 * median payment × cadence-normalized payment count. Median × snapped count
 * is immune to the two classic distortions in raw annual sums — a payment
 * slipping across the year boundary (11 vs 13 payments) and one-off special
 * dividends — either of which would otherwise register as a phantom cut or
 * growth spike.
 */
function annualRates(events: DividendEvent[]): { year: number; rate: number }[] {
  const currentYear = new Date().getUTCFullYear();
  const byYear = new Map<number, number[]>();
  for (const e of events) {
    const y = Number(e.date.slice(0, 4));
    if (y >= currentYear) continue; // partial year would distort growth
    const arr = byYear.get(y);
    if (arr) arr.push(e.amount);
    else byYear.set(y, [e.amount]);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, amounts]) => ({
      year,
      rate: median(amounts) * snapCount(amounts.length),
    }));
}

/** Trailing-12-month per-share sum. */
function ttmRate(events: DividendEvent[]): number {
  const cutoff = Date.now() - 365 * 86_400_000;
  let sum = 0;
  for (const e of events) {
    if (new Date(`${e.date}T00:00:00Z`).getTime() >= cutoff) sum += e.amount;
  }
  return sum;
}

function cagr(rates: { rate: number }[], years: number): number | null {
  if (rates.length < years + 1) return null;
  const a = rates[rates.length - 1 - years].rate;
  const b = rates[rates.length - 1].rate;
  if (a <= 0 || b <= 0) return null;
  return Math.pow(b / a, 1 / years) - 1;
}

function payFrequency(events: DividendEvent[]): PayFrequency {
  if (events.length === 0) return "none";
  const recent = events.slice(-9);
  if (recent.length < 2) return "irregular";
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    gaps.push(
      (new Date(recent[i].date).getTime() - new Date(recent[i - 1].date).getTime()) /
        86_400_000
    );
  }
  const gap = median(gaps);
  if (gap <= 45) return "monthly";
  if (gap <= 115) return "quarterly";
  if (gap <= 220) return "semiannual";
  if (gap <= 420) return "annual";
  return "irregular";
}

const PAYMENTS_PER_YEAR: Record<PayFrequency, number> = {
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
  irregular: 4,
  none: 0,
};

/* ── Per-holding evaluation ──────────────────────────────────────────── */

function evaluateHolding(
  p: Position,
  profile: DividendProfile | null
): HoldingDividend | null {
  const sector = p.fundamentals?.sector ?? "Unknown";
  const price = p.shares > 0 ? p.equity / p.shares : null;

  // Income: provider forward rate, else TTM history, else estimate from the
  // fundamentals yield (marked as estimated and excluded from history math).
  const ttm = profile ? ttmRate(profile.events) : 0;
  let rate = profile?.forwardRate ?? (ttm > 0 ? ttm : null);
  let estimated = false;
  if (rate === null) {
    const y = p.fundamentals?.dividendYield ?? 0;
    if (y > 0 && price !== null) {
      rate = y * price;
      estimated = true;
    }
  }
  if (rate === null || rate <= 0 || p.shares <= 0) return null;

  const income = rate * p.shares;
  const rates = profile ? annualRates(profile.events) : [];
  const last = rates.length > 0 ? rates[rates.length - 1] : null;
  const prev = rates.length > 1 ? rates[rates.length - 2] : null;

  const growth1 =
    last && prev && prev.rate > 0 ? last.rate / prev.rate - 1 : null;
  const cagr3 = cagr(rates, 3);
  const cagr5 = cagr(rates, 5);

  // Streak of yearly increases, cuts, and growth consistency.
  let streak = 0;
  for (let i = rates.length - 1; i > 0; i--) {
    if (rates[i].rate > rates[i - 1].rate * 1.001) streak++;
    else break;
  }
  let cuts10y = 0;
  let lastCutAgo: number | null = null;
  const latestYear = rates.length > 0 ? rates[rates.length - 1].year : null;
  const yoyPositives: number[] = [];
  for (let i = Math.max(1, rates.length - 10); i < rates.length; i++) {
    const chg = rates[i].rate / rates[i - 1].rate - 1;
    if (chg < -0.02) {
      cuts10y++;
      if (latestYear !== null) lastCutAgo = latestYear - rates[i].year;
    }
    yoyPositives.push(chg >= 0 ? 1 : 0);
  }
  const consistency = mean(yoyPositives);

  const frequency = profile ? payFrequency(profile.events) : "none";

  // Months that paid over the trailing year (drives the calendar layer).
  const cutoff = Date.now() - 366 * 86_400_000;
  const payMonths = [
    ...new Set(
      (profile?.events ?? [])
        .filter((e) => new Date(`${e.date}T00:00:00Z`).getTime() >= cutoff)
        .map((e) => Number(e.date.slice(5, 7)))
    ),
  ].sort((a, b) => a - b);

  const currentYield = price !== null && price > 0 ? rate / price : null;
  const yieldOnCost = p.averageCost > 0 ? rate / p.averageCost : null;

  const isFund = profile?.kind === "fund" || !!p.fundamentals?.fund;

  // ── Safety: sustainability of the current payout ──────────────────────
  // Starts neutral; earns or loses points on payout coverage, track record,
  // and yield sanity. Every adjustment is recorded so the score is auditable.
  let safety = 50;
  const notes: string[] = [];
  const flags: string[] = [];
  const bump = (pts: number, note: string) => {
    safety += pts;
    notes.push(`${pts > 0 ? "+" : ""}${pts}: ${note}`);
  };

  // GAAP earnings understate REIT cash flow (depreciation), so a REIT's
  // payout ratio reads catastrophic even when the dividend is fine. Judge
  // REITs on cash-flow coverage and track record instead.
  const isReit = sector === "Real Estate";

  if (!isFund) {
    const payout = profile?.payoutRatio ?? null;
    if (payout !== null && !isReit) {
      if (payout <= 0) bump(-10, "no earnings cover the dividend");
      else if (payout < 0.4) bump(20, `modest ${pct(payout)} earnings payout`);
      else if (payout < 0.6) bump(10, `comfortable ${pct(payout)} earnings payout`);
      else if (payout < 0.75) bump(0, `${pct(payout)} earnings payout — fair but full`);
      else if (payout < 0.95) bump(-15, `stretched ${pct(payout)} earnings payout`);
      else bump(-25, `${pct(payout)} payout exceeds comfort — little margin for error`);
      if (payout >= 0.85) flags.push(`Payout ratio ${pct(payout)} leaves little room for earnings slips`);
    }
    if (isReit) {
      bump(0, "REIT — GAAP payout ratio ignored; judged on cash flow, streak, and yield");
    }
    const fcfPayout = profile?.fcfPayout ?? null;
    if (fcfPayout !== null) {
      // Graduated coverage: the gap between "covered twice over" and "barely
      // covered" is the difference between a safe and a stretched payout.
      if (fcfPayout <= 0 || fcfPayout >= 1) {
        bump(isReit ? -6 : -15, isReit ? "distributions outrun stated free cash flow (common for REITs, still worth watching)" : "free cash flow does not cover the dividend");
        if (!isReit) flags.push("Dividend is not covered by free cash flow");
      } else if (fcfPayout < 0.5) bump(12, `free cash flow covers the dividend ${(1 / fcfPayout).toFixed(1)}× over`);
      else if (fcfPayout < 0.7) bump(7, `free cash flow comfortably covers the dividend (${pct(fcfPayout)} of FCF)`);
      else if (fcfPayout < 0.9) bump(0, `${pct(fcfPayout)} of free cash flow funds the dividend — limited cushion`);
      else bump(isReit ? -3 : -8, `${pct(fcfPayout)} of free cash flow funds the dividend — thin cushion`);
    }
    if ((p.fundamentals?.fcfGrowth ?? 0) < -0.05) {
      bump(-8, "free cash flow is shrinking");
      flags.push("Declining free cash flow behind the payout");
    }
    // Earnings trajectory interacts with how much of those earnings is already
    // committed: a falling line matters more when the payout already eats most
    // of it, and a low payout with rising earnings buys room to keep raising.
    const eps = p.fundamentals?.epsGrowth ?? null;
    const heavyPayout = payout !== null && payout > 0.6;
    if (eps !== null && eps < -0.05) {
      bump(
        heavyPayout ? -10 : -5,
        heavyPayout
          ? "earnings are declining while the payout is already high"
          : "earnings are declining"
      );
      if (heavyPayout) flags.push("Payout is high and earnings are declining");
    } else if (eps !== null && eps > 0.05 && payout !== null && payout > 0 && payout < 0.5) {
      bump(4, "low payout with growing earnings — ample room to keep raising");
    }
  } else {
    bump(8, "fund distribution — pass-through of underlying holdings");
  }

  if (streak >= 25) bump(18, `${streak} consecutive years of increases — an exceptional record`);
  else if (streak >= 20) bump(15, `${streak} consecutive years of increases`);
  else if (streak >= 10) bump(10, `${streak} consecutive years of increases`);
  else if (streak >= 5) bump(5, `${streak}-year increase streak`);
  if (cuts10y > 0) {
    // A cut bites harder the more recent it is and compounds with repetition;
    // a single reduction a decade ago is far less damning than one last year.
    const recencyMult =
      lastCutAgo !== null && lastCutAgo <= 2
        ? 1.5
        : lastCutAgo !== null && lastCutAgo <= 5
          ? 1.1
          : 0.7;
    const penalty = Math.min(
      Math.round(12 * Math.min(cuts10y, 3) * recencyMult),
      38
    );
    const when =
      lastCutAgo === null
        ? ""
        : lastCutAgo <= 0
          ? ", most recent this year"
          : `, most recent ${lastCutAgo}y ago`;
    bump(-penalty, `${cuts10y} cut${cuts10y > 1 ? "s" : ""} in the last decade${when}`);
    flags.push(`Cut its dividend ${cuts10y > 1 ? `${cuts10y} times` : "once"} in the last decade`);
  }
  if (currentYield !== null) {
    if (currentYield > 0.08) {
      bump(-20, `${pct(currentYield)} yield — the market is pricing distress`);
      flags.push(`Yield of ${pct(currentYield)} looks like a yield trap candidate`);
    } else if (currentYield > 0.06) {
      bump(-8, `${pct(currentYield)} yield is rich — verify it's earned`);
      flags.push(`Elevated ${pct(currentYield)} yield deserves scrutiny`);
    }
  }
  if (rates.length < 2 && !estimated) {
    bump(-5, "very short dividend history");
    flags.push("Less than two full years of dividend history");
  }
  if (estimated) flags.push("Income estimated from yield — provider history unavailable");
  safety = Math.round(clamp(safety, 3, 98));
  const safetyTone: SafetyTone = safety >= 65 ? "safe" : safety >= 45 ? "watch" : "risk";
  if (safetyTone === "risk") flags.push("Safety score flags this payout as fragile");

  // ── Quality: is the business behind the check any good? ───────────────
  let quality: number | null = null;
  if (p.fundamentals && !isFund) {
    const f = p.fundamentals;
    let q = 50;
    if (f.roic > 0.2) q += 20;
    else if (f.roic > 0.12) q += 12;
    else if (f.roic < 0.06) q -= 12;
    if (f.operatingMargin > 0.25) q += 10;
    else if (f.operatingMargin < 0.08) q -= 10;
    if ((consistency ?? 0) >= 0.9) q += 10;
    else if ((consistency ?? 1) < 0.6) q -= 10;
    if (streak >= 10) q += 10;
    quality = Math.round(clamp(q, 5, 98));
  } else if (isFund) {
    quality = Math.round(
      clamp(55 + ((consistency ?? 0.5) - 0.5) * 60 + Math.min(streak, 10) * 2, 5, 95)
    );
  }

  return {
    symbol: p.symbol,
    name: p.name,
    sector,
    kind: isFund ? "fund" : "stock",
    income,
    incomeShare: 0, // filled at the portfolio level
    estimated,
    currentYield,
    yieldOnCost,
    frequency,
    payMonths,
    growth1,
    cagr3,
    cagr5,
    streak,
    cuts10y,
    consistency,
    payoutRatio: isFund ? null : (profile?.payoutRatio ?? null),
    fcfPayout: isFund ? null : (profile?.fcfPayout ?? null),
    safety,
    safetyTone,
    quality,
    flags,
    safetyNotes: notes,
  };
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

/* ── Portfolio-level report ──────────────────────────────────────────── */

export function dividendReport(
  portfolio: Portfolio,
  profiles: Record<string, DividendProfile | null>
): DividendReport {
  const holdings: HoldingDividend[] = [];
  for (const p of portfolio.positions) {
    const h = evaluateHolding(p, profiles[p.symbol] ?? null);
    if (h) holdings.push(h);
  }
  holdings.sort((a, b) => b.income - a.income);

  const annualIncome = holdings.reduce((a, h) => a + h.income, 0);
  for (const h of holdings) {
    h.incomeShare = annualIncome > 0 ? h.income / annualIncome : 0;
  }

  // TTM income: what the current share count would have collected last year.
  let ttmIncome = 0;
  for (const p of portfolio.positions) {
    const prof = profiles[p.symbol];
    if (prof) ttmIncome += ttmRate(prof.events) * p.shares;
  }

  const wAvg = (pick: (h: HoldingDividend) => number | null): number | null => {
    let sw = 0;
    let sx = 0;
    for (const h of holdings) {
      const v = pick(h);
      if (v === null) continue;
      sw += h.incomeShare;
      sx += h.incomeShare * v;
    }
    return sw > 0.2 ? sx / sw : null; // demand real coverage before averaging
  };

  /* Growth layer */
  const portfolioGrowth1 = wAvg((h) => h.growth1);
  const portfolioCagr3 = wAvg((h) => h.cagr3);
  const portfolioCagr5 = wAvg((h) => h.cagr5);
  const accelerating =
    portfolioGrowth1 !== null && portfolioCagr5 !== null
      ? portfolioGrowth1 > portfolioCagr5 + 0.005
      : null;

  /* Concentration layer */
  const hhiPos = holdings.reduce((a, h) => a + h.incomeShare ** 2, 0);
  const effectivePayers = hhiPos > 0 ? 1 / hhiPos : 0;
  const topPayerShare = holdings[0]?.incomeShare ?? 0;
  const top3Share = holdings.slice(0, 3).reduce((a, h) => a + h.incomeShare, 0);

  // Sector income with ETF look-through where the fund mix is known.
  const posBySymbol = new Map(portfolio.positions.map((p) => [p.symbol, p]));
  const sectorMap = new Map<string, number>();
  for (const h of holdings) {
    const pos = posBySymbol.get(h.symbol);
    const fundMix = pos?.fundamentals?.fund?.sectorWeights;
    if (h.kind === "fund" && fundMix) {
      for (const [sector, w] of Object.entries(fundMix)) {
        sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + h.income * (w ?? 0));
      }
    } else {
      sectorMap.set(h.sector, (sectorMap.get(h.sector) ?? 0) + h.income);
    }
  }
  const sectorIncome = [...sectorMap.entries()]
    .map(([sector, income]) => ({
      sector,
      income,
      share: annualIncome > 0 ? income / annualIncome : 0,
    }))
    .sort((a, b) => b.income - a.income);
  const hhiSec = sectorIncome.reduce((a, s) => a + s.share ** 2, 0);
  const effectiveSectors = hhiSec > 0 ? 1 / hhiSec : 0;

  /* Calendar layer: project the next year onto calendar months using each
     holding's actual payment months, scaled to its forward rate. */
  const calendar: MonthIncome[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: 0,
    payers: [],
  }));
  for (const h of holdings) {
    const months =
      h.payMonths.length > 0
        ? h.payMonths
        : h.frequency === "none" || PAYMENTS_PER_YEAR[h.frequency] === 0
          ? [3, 6, 9, 12]
          : h.frequency === "monthly"
            ? Array.from({ length: 12 }, (_, i) => i + 1)
            : [3, 6, 9, 12].slice(0, PAYMENTS_PER_YEAR[h.frequency]);
    const perPayment = h.income / months.length;
    for (const m of months) {
      calendar[m - 1].income += perPayment;
      calendar[m - 1].payers.push(h.symbol);
    }
  }
  const monthly = calendar.map((m) => m.income);
  const mMean = mean(monthly) ?? 0;
  const evenness =
    mMean > 0
      ? Math.sqrt(
          monthly.reduce((a, v) => a + (v - mMean) ** 2, 0) / 12
        ) / mMean
      : null;
  const gapMonths = calendar.filter((m) => m.income === 0).map((m) => m.month);

  /* Scores */
  const safety = Math.round(wAvg((h) => h.safety) ?? 50);

  const growthBasis = portfolioCagr3 ?? portfolioGrowth1 ?? null;
  let growthScore = 50;
  if (growthBasis !== null) {
    // Blend the 3y trend with the 5y where available so a one-year pop doesn't
    // carry the score — durable growth is what's being rewarded. The scale is
    // anchored so matching the S&P's ~6%/yr long-run growth lands near 65.
    const durable =
      portfolioCagr5 !== null
        ? growthBasis * 0.6 + portfolioCagr5 * 0.4
        : growthBasis;
    growthScore = 40 + durable * 420;
    // Beating the benchmark is a real edge; lagging it is a real drag.
    growthScore += clamp((growthBasis - spxDivGrowth()) * 80, -8, 8);
    if (accelerating === true) growthScore += 5;
    if (accelerating === false) growthScore -= 3;
    // A recent stall caps enthusiasm even when the multi-year trend is up.
    if (portfolioGrowth1 !== null && portfolioGrowth1 < 0) growthScore -= 6;
    growthScore = clamp(growthScore, 5, 95);
  }
  growthScore = Math.round(growthScore);

  const consistencyAvg = wAvg((h) => h.consistency);
  const cutShare = holdings.reduce(
    (a, h) => a + (h.cuts10y > 0 ? h.incomeShare : 0),
    0
  );
  const suspectShare = holdings.reduce(
    (a, h) => a + (h.safetyTone === "risk" ? h.incomeShare : 0),
    0
  );
  let stability =
    55 +
    ((consistencyAvg ?? 0.75) - 0.75) * 120 - // perfect raisers earn, choppers bleed
    cutShare * 40 -
    suspectShare * 25 +
    (evenness !== null && evenness < 0.35 ? 6 : 0);
  stability = Math.round(clamp(stability, 5, 98));

  let diversification =
    50 * Math.min(effectivePayers / 8, 1) + // ≥8 effective payers = full marks
    35 * Math.min(effectiveSectors / 5, 1) + // ≥5 effective sectors
    15 * (1 - Math.min(topPayerShare / 0.5, 1)); // single-name dependence
  diversification = Math.round(clamp(diversification, 5, 98));

  // Composite mirrors the design priorities: sustainability first, then
  // growth, then reliability and diversification of the stream.
  const composite = Math.round(
    clamp(
      safety * 0.35 + growthScore * 0.25 + stability * 0.2 + diversification * 0.2,
      0,
      100
    )
  );
  const grade: DividendGrade =
    composite >= 78
      ? "Elite"
      : composite >= 62
        ? "Strong"
        : composite >= 45
          ? "Average"
          : composite >= 30
            ? "Weak"
            : "High Risk";

  /* Forecast */
  const base = growthBasis ?? 0.03;
  const conservative = Math.max(
    Math.min(base, portfolioCagr5 ?? base) - 0.02 - (safety < 45 ? 0.03 : 0),
    -0.05
  );
  const optimistic = Math.max(base, portfolioGrowth1 ?? base) + 0.02;
  const equityYield =
    portfolio.equityValue > 0 ? annualIncome / portfolio.equityValue : 0;
  const project = (g: number, years: number) =>
    annualIncome * Math.pow(1 + g, years);
  const projectDrip = (g: number, years: number) =>
    // Reinvested payments buy more shares at ~today's yield.
    annualIncome * Math.pow((1 + g) * (1 + equityYield), years);
  const mk = (
    id: ScenarioRow["id"],
    label: string,
    g: number
  ): ScenarioRow => ({
    id,
    label,
    growth: g,
    y1: project(g, 1),
    y3: project(g, 3),
    y5: project(g, 5),
    y5Drip: projectDrip(g, 5),
  });
  const scenarios = [
    mk("conservative", "Conservative", conservative),
    mk("base", "Base", base),
    mk("optimistic", "Optimistic", optimistic),
  ];
  const dripBoost5y = scenarios[1].y5Drip - scenarios[1].y5;

  /* Risk roll-up */
  const riskFlags = holdings.flatMap((h) =>
    h.flags.map((flag) => ({ symbol: h.symbol, flag }))
  );

  return {
    asOf: new Date().toISOString(),
    annualIncome,
    ttmIncome,
    monthlyAvg: annualIncome / 12,
    portfolioYield:
      portfolio.totalValue > 0 ? annualIncome / portfolio.totalValue : 0,
    equityYield,
    yieldOnCost:
      portfolio.totalCostBasis > 0
        ? annualIncome / portfolio.totalCostBasis
        : 0,
    payerCount: holdings.length,
    positionCount: portfolio.positions.length,
    estimatedCount: holdings.filter((h) => h.estimated).length,
    composite,
    grade,
    safety,
    growth: growthScore,
    stability,
    diversification,
    portfolioGrowth1,
    portfolioCagr3,
    portfolioCagr5,
    accelerating,
    topPayerShare,
    top3Share,
    effectivePayers,
    sectorIncome,
    effectiveSectors,
    calendar,
    evenness,
    gapMonths,
    scenarios,
    dripBoost5y,
    riskFlags,
    benchmarks: [
      { label: "S&P 500", yield: 0.0125 },
      { label: "NASDAQ-100", yield: 0.005 },
    ],
    holdings,
    methodology: [
      "Forward income = shares × the declared forward rate, falling back to the trailing-12-month payment sum; positions with neither are estimated from the live dividend yield and marked.",
      "Growth, streaks, and cut detection use completed calendar years only, on each year's median payment × normalized payment count — so a half-finished year, a payment slipping across a year boundary, or a one-off special dividend never reads as a cut or a growth spike.",
      "Safety starts neutral at 50 and earns or loses points on earnings payout, graduated free-cash-flow coverage (covered twice over vs. barely covered scores differently), increase streaks — with a premium for 25-year records — past cuts weighted by how recent they are, the payout-versus-earnings-trajectory interaction, and yield sanity. Every adjustment is recorded on the holding.",
      `The composite weighs safety 35%, growth 25%, stability 20%, and diversification 20% — sustainability over headline yield, growth over static income. Portfolio aggregates are income-weighted; the growth score blends the 3- and 5-year trends and is anchored to the S&P's long-run ~${Math.round(spxDivGrowth() * 100)}%/yr dividend growth, so matching the index reads as average and beating it scores up.`,
      "Calendar projection assigns each holding's forward income to the months it actually paid in over the last year.",
      "Reinvestment scenarios compound income at growth × (1 + current equity yield) — a standing DRIP at today's prices.",
      "ETF distributions are evaluated on payment history (consistency, streaks, cuts); payout ratios don't apply to funds. Sector income looks through fund holdings where the mix is known.",
      "REITs are judged on cash-flow coverage and track record — GAAP payout ratios overstate REIT payout because depreciation suppresses earnings.",
    ],
  };
}
