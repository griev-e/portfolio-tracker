import { covarianceMatrix } from "@/lib/analytics/correlation";
import { CMA } from "@/lib/data/benchmarks";
import { UNKNOWN_DEFAULTS } from "@/lib/data/fundamentals";
import type { Fundamentals, Portfolio } from "@/lib/types";
import type {
  FrontierPoint,
  ObjectiveId,
  OptimizedPosition,
  OptimizerConstraints,
  OptimizerResult,
  PortfolioMetrics,
} from "./types";

/**
 * Constrained portfolio optimizer — institutional methodology, run client-side.
 *
 * The optimization is over the **invested book** (cash held constant): we solve
 * for a long-only weight vector w on the equity positions that sums to 1 and
 * respects a per-name cap, then map back to total weights with the existing cash
 * sleeve. Co-movement comes from the same positive-semi-definite factor
 * covariance Σ the Risk and Correlation pages use (`covarianceMatrix`), and
 * expected returns are CAPM (rf + β·ERP) on the shared capital-market
 * assumptions (`CMA`) — so the optimizer never invents a number the rest of the
 * app doesn't already stand behind.
 *
 * Solver: projected gradient ascent on the capped simplex with an arc line
 * search, run from several deterministic starts (current mix, equal weight, a
 * few seeded perturbations) and the best objective kept. Every objective is
 * smooth with an analytic gradient. Risk parity uses the standard cyclical
 * coordinate descent (equal risk contributions) instead. All deterministic: the
 * same book and settings always produce the same plan.
 *
 * These are model-based estimates, not advice — assumptions are surfaced in the UI.
 */

/* ─────────────────────────────── linear algebra ─────────────────────────── */

const dot = (a: number[], b: number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

const matVec = (m: number[][], v: number[]): number[] =>
  m.map((row) => dot(row, v));

/** Quadratic form wᵀ Σ w. */
const quad = (w: number[], cov: number[][]): number => dot(w, matVec(cov, w));

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Tiny seeded PRNG so the random restarts are deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Euclidean projection of v onto { w : Σwᵢ = 1, 0 ≤ wᵢ ≤ cap }.
 * The KKT solution is wᵢ = clip(vᵢ − τ, 0, cap); since Σ clip(vᵢ − τ, …) is
 * monotone decreasing in τ, a bisection on τ pins the sum to 1 exactly.
 */
function projectCappedSimplex(v: number[], cap: number): number[] {
  const n = v.length;
  if (n === 0) return [];
  // Feasibility: need n·cap ≥ 1, else the cap can't hold a full portfolio.
  const c = Math.min(1, Math.max(cap, 1 / n + 1e-9));
  let lo = Math.min(...v) - c;
  let hi = Math.max(...v);
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    let s = 0;
    for (let i = 0; i < n; i++) s += Math.max(0, Math.min(c, v[i] - mid));
    if (s > 1) lo = mid;
    else hi = mid;
  }
  const tau = (lo + hi) / 2;
  return v.map((x) => Math.max(0, Math.min(c, x - tau)));
}

/* ─────────────────────────────── solver core ────────────────────────────── */

interface Ctx {
  n: number;
  mu: number[]; // CAPM expected return per name
  vol: number[]; // standalone annualized volatility
  yld: number[]; // dividend yield
  qual: number[]; // 0..1 quality score
  cov: number[][]; // factor covariance Σ
  cashWeight: number;
  rf: number;
  current: number[]; // current invested weights (sum 1)
}

type Objective = (w: number[]) => number;
type Gradient = (w: number[]) => number[];

/** Projected gradient ascent with an arc (projected) line search. */
function ascend(
  start: number[],
  f: Objective,
  grad: Gradient,
  cap: number,
  iters: number
): number[] {
  let w = projectCappedSimplex(start, cap);
  let fw = f(w);
  for (let it = 0; it < iters; it++) {
    const g = grad(w);
    let gmax = 0;
    for (const x of g) gmax = Math.max(gmax, Math.abs(x));
    if (gmax < 1e-12) break;
    let step = 1 / gmax; // scale the first probe to ~unit move
    let improved = false;
    for (let ls = 0; ls < 40; ls++) {
      const wn = projectCappedSimplex(
        w.map((x, i) => x + step * g[i]),
        cap
      );
      const fn = f(wn);
      if (fn > fw + 1e-10) {
        w = wn;
        fw = fn;
        improved = true;
        break;
      }
      step *= 0.5;
    }
    if (!improved) break;
  }
  return w;
}

/** Multistart wrapper — keeps the best objective across deterministic starts. */
function maximize(
  ctx: Ctx,
  f: Objective,
  grad: Gradient,
  cap: number,
  iters = 250
): number[] {
  const { n } = ctx;
  const starts: number[][] = [
    ctx.current.slice(),
    new Array(n).fill(1 / n),
  ];
  const rng = mulberry32((0x9e3779b9 ^ n) >>> 0);
  for (let s = 0; s < 3; s++) {
    starts.push(Array.from({ length: n }, () => rng()));
  }
  let best = starts[0];
  let bestF = -Infinity;
  for (const st of starts) {
    const w = ascend(st, f, grad, cap, iters);
    const fv = f(w);
    if (fv > bestF) {
      bestF = fv;
      best = w;
    }
  }
  return best;
}

/** Risk parity via cyclical coordinate descent → equal risk contributions. */
function riskParity(cov: number[][], cap: number): number[] {
  const n = cov.length;
  const w = new Array(n).fill(1 / n);
  for (let it = 0; it < 300; it++) {
    let maxChange = 0;
    for (let i = 0; i < n; i++) {
      let b = 0;
      for (let j = 0; j < n; j++) if (j !== i) b += cov[i][j] * w[j];
      const a = cov[i][i];
      // wᵢ solves a·wᵢ² + b·wᵢ − 1 = 0 (the equal-RC fixed point, c = 1).
      const wi = (-b + Math.sqrt(b * b + 4 * a)) / (2 * a);
      maxChange = Math.max(maxChange, Math.abs(wi - w[i]));
      w[i] = wi;
    }
    let sum = 0;
    for (const x of w) sum += x;
    for (let i = 0; i < n; i++) w[i] /= sum;
    if (maxChange < 1e-9) break;
  }
  return projectCappedSimplex(w, cap);
}

/**
 * Euclidean projection of v onto { w : Σwᵢ = 1, loᵢ ≤ wᵢ ≤ cap } — the capped
 * simplex with a per-name lower bound. Same monotone-τ bisection as the plain
 * version, generalized so held positions can carry a floor.
 */
function projectBoxedSimplex(v: number[], lo: number[], cap: number): number[] {
  const n = v.length;
  if (n === 0) return [];
  let tauLo = Number.POSITIVE_INFINITY;
  let tauHi = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    tauLo = Math.min(tauLo, v[i] - cap);
    tauHi = Math.max(tauHi, v[i] - lo[i]);
  }
  for (let iter = 0; iter < 100; iter++) {
    const mid = (tauLo + tauHi) / 2;
    let s = 0;
    for (let i = 0; i < n; i++) s += Math.max(lo[i], Math.min(cap, v[i] - mid));
    if (s > 1) tauLo = mid;
    else tauHi = mid;
  }
  const tau = (tauLo + tauHi) / 2;
  return v.map((x, i) => Math.max(lo[i], Math.min(cap, x - tau)));
}

/**
 * Keep the optimizer from fully exiting names you already hold: enforce a floor
 * of `minHold` on every currently-held position, then re-project so the vector
 * still sums to 1 under the cap. The floor is clamped so the floors can always
 * fit inside a full portfolio.
 */
function applyHoldFloor(
  w: number[],
  current: number[],
  minHold: number,
  cap: number
): number[] {
  if (minHold <= 0) return w;
  let heldCount = 0;
  for (const c of current) if (c > 1e-9) heldCount++;
  if (heldCount === 0) return w;
  // Floors must leave room to sum to 1 (with a little slack for the others).
  const effFloor = Math.min(minHold, (0.95 / heldCount), cap);
  const lo = current.map((c) => (c > 1e-9 ? effFloor : 0));
  return projectBoxedSimplex(w, lo, cap);
}

/* ───────────────────────────── inputs & metrics ─────────────────────────── */

/** 0..1 composite quality score from ROIC, operating margin, revenue growth. */
function qualityScore(f: Fundamentals | null): number {
  if (!f) return 0.5;
  const roic = clamp01(f.roic / 0.25);
  const margin = clamp01(f.operatingMargin / 0.4);
  const growth = clamp01(f.revenueGrowth / 0.3);
  return 0.4 * roic + 0.35 * margin + 0.25 * growth;
}

function buildCtx(portfolio: Portfolio): Ctx | null {
  const ps = portfolio.positions;
  const n = ps.length;
  if (n === 0) return null;

  const investedSum = ps.reduce((s, p) => s + Math.max(0, p.equity), 0);
  if (investedSum <= 0) return null;

  const cov = covarianceMatrix(portfolio);
  const rf = CMA.riskFree;

  const mu = ps.map(
    (p) =>
      rf + (p.fundamentals?.beta ?? UNKNOWN_DEFAULTS.beta) * CMA.equityRiskPremium
  );
  const vol = ps.map(
    (p) => p.fundamentals?.volatility ?? UNKNOWN_DEFAULTS.volatility
  );
  const yld = ps.map((p) => p.fundamentals?.dividendYield ?? 0);
  const qual = ps.map((p) => qualityScore(p.fundamentals));
  // Current invested weights, normalized to sum to 1 across the equity book.
  const current = ps.map((p) => Math.max(0, p.equity) / investedSum);

  return {
    n,
    mu,
    vol,
    yld,
    qual,
    cov,
    cashWeight: portfolio.cashWeight,
    rf,
    current,
  };
}

/** Risk/return metrics for an invested weight vector, on the total book. */
function metricsFor(w: number[], ctx: Ctx): PortfolioMetrics {
  const invFrac = 1 - ctx.cashWeight;
  const total = w.map((x) => x * invFrac);

  const expectedReturn =
    ctx.cashWeight * ctx.rf + dot(total, ctx.mu);
  const variance = Math.max(0, quad(total, ctx.cov));
  const volatility = Math.sqrt(variance);
  const sharpe = volatility > 0 ? (expectedReturn - ctx.rf) / volatility : 0;

  // Diversification ratio on the invested sleeve.
  const wAvgVol = dot(w, ctx.vol);
  const investedVar = Math.max(0, quad(w, ctx.cov));
  const investedVol = Math.sqrt(investedVar);
  const diversification = investedVol > 0 ? wAvgVol / investedVol : 1;

  let hhi = 0;
  let topWeight = 0;
  for (const x of w) {
    hhi += x * x;
    if (x > topWeight) topWeight = x;
  }
  const effectiveN = hhi > 0 ? 1 / hhi : 0;

  const yld = dot(w, ctx.yld);
  const beta = ps_beta(total, ctx);

  return {
    expectedReturn,
    volatility,
    sharpe,
    diversification,
    effectiveN,
    topWeight,
    yield: yld,
    beta,
  };
}

/** Total-book beta — cash contributes 0. Recovered from μ = rf + β·ERP. */
function ps_beta(total: number[], ctx: Ctx): number {
  let b = 0;
  for (let i = 0; i < total.length; i++) {
    b += total[i] * ((ctx.mu[i] - ctx.rf) / CMA.equityRiskPremium);
  }
  return b;
}

/* ──────────────────────────────── objectives ────────────────────────────── */

function solveObjective(
  ctx: Ctx,
  objective: ObjectiveId,
  cap: number
): number[] {
  const { mu, vol, yld, qual, cov } = ctx;
  const Sw = (w: number[]) => matVec(cov, w);

  switch (objective) {
    case "min-vol":
      return maximize(
        ctx,
        (w) => -quad(w, cov),
        (w) => Sw(w).map((x) => -2 * x),
        cap
      );

    case "max-return":
      return maximize(
        ctx,
        (w) => dot(w, mu),
        () => mu.slice(),
        cap
      );

    case "sharpe":
      return maximize(
        ctx,
        (w) => {
          const v = Math.sqrt(Math.max(quad(w, cov), 1e-12));
          return (dot(w, mu) - ctx.rf) / v;
        },
        (w) => {
          const v = Math.max(quad(w, cov), 1e-12);
          const root = Math.sqrt(v);
          const sw = Sw(w);
          const excess = dot(w, mu) - ctx.rf;
          // ∇ = μ/√v − excess·Σw / v^{3/2}
          return mu.map((m, i) => m / root - (excess * sw[i]) / (v * root));
        },
        cap
      );

    case "max-div":
      return maximize(
        ctx,
        (w) => {
          const v = Math.sqrt(Math.max(quad(w, cov), 1e-12));
          return dot(w, vol) / v;
        },
        (w) => {
          const v = Math.max(quad(w, cov), 1e-12);
          const root = Math.sqrt(v);
          const sw = Sw(w);
          const wv = dot(w, vol);
          // ∇ = σ/√v − (wᵀσ)·Σw / v^{3/2}
          return vol.map((s, i) => s / root - (wv * sw[i]) / (v * root));
        },
        cap
      );

    case "income": {
      // Maximize yield with a modest variance penalty so it can't pile into a
      // single high-yield name and blow up risk.
      const lambda = 0.35;
      return maximize(
        ctx,
        (w) => dot(w, yld) - lambda * quad(w, cov),
        (w) => {
          const sw = Sw(w);
          return yld.map((y, i) => y - lambda * 2 * sw[i]);
        },
        cap
      );
    }

    case "quality": {
      const lambda = 0.35;
      return maximize(
        ctx,
        (w) => dot(w, qual) - lambda * quad(w, cov),
        (w) => {
          const sw = Sw(w);
          return qual.map((q, i) => q - lambda * 2 * sw[i]);
        },
        cap
      );
    }

    case "risk-parity":
      return riskParity(cov, cap);

    case "equal":
      return projectCappedSimplex(new Array(ctx.n).fill(1 / ctx.n), cap);

    default:
      return ctx.current.slice();
  }
}

/* ───────────────────────────── efficient frontier ───────────────────────── */

/** Sweep risk aversion λ over max(wᵀμ − λ·wᵀΣw) and keep the upper envelope. */
function computeFrontier(ctx: Ctx, cap: number): FrontierPoint[] {
  const pts: FrontierPoint[] = [];
  for (let k = 0; k < 22; k++) {
    const lambda = Math.pow(10, -1 + (3 * k) / 21); // 0.1 … 100
    const w = maximize(
      ctx,
      (x) => dot(x, ctx.mu) - lambda * quad(x, ctx.cov),
      (x) => {
        const sw = matVec(ctx.cov, x);
        return ctx.mu.map((m, i) => m - lambda * 2 * sw[i]);
      },
      cap,
      140
    );
    const m = metricsFor(w, ctx);
    pts.push({ vol: m.volatility, ret: m.expectedReturn });
  }
  pts.sort((a, b) => a.vol - b.vol);
  // Upper envelope: along the efficient frontier, return rises with volatility.
  const env: FrontierPoint[] = [];
  let maxRet = -Infinity;
  for (const p of pts) {
    if (p.ret > maxRet - 1e-9) {
      env.push(p);
      maxRet = Math.max(maxRet, p.ret);
    }
  }
  return env;
}

/* ──────────────────────────────── entry point ───────────────────────────── */

export function optimizePortfolio(
  portfolio: Portfolio,
  objective: ObjectiveId,
  constraints: OptimizerConstraints
): OptimizerResult | null {
  const ctx = buildCtx(portfolio);
  if (!ctx) return null;

  const cap = Math.min(1, Math.max(constraints.maxWeight, 1 / ctx.n + 1e-9));

  let target = solveObjective(ctx, objective, cap);
  // Unless full exits are allowed, keep currently-held names above the floor so
  // the optimizer trims rather than zeroes them out.
  if (!constraints.allowExit) {
    target = applyHoldFloor(target, ctx.current, constraints.minWeight, cap);
  }

  const metricsBefore = metricsFor(ctx.current, ctx);
  const metricsAfter = metricsFor(target, ctx);

  const invFrac = 1 - ctx.cashWeight;
  const ps = portfolio.positions;
  const totalValue = portfolio.totalValue;

  let buys = 0;
  let sells = 0;
  let turnoverAbs = 0;

  const positions: OptimizedPosition[] = ps.map((p, i) => {
    const currentWeight = ctx.current[i];
    const targetWeight = target[i];
    const currentTotalWeight = p.weight;
    const targetTotalWeight = targetWeight * invFrac;
    const dollarDelta = (targetTotalWeight - currentTotalWeight) * totalValue;
    turnoverAbs += Math.abs(targetTotalWeight - currentTotalWeight);
    const shares = p.price > 0 ? dollarDelta / p.price : 0;

    let action: OptimizedPosition["action"];
    if (targetWeight < 1e-4 && currentWeight > 1e-4) action = "exit";
    else if (dollarDelta > 1) action = "buy";
    else if (dollarDelta < -1) action = "sell";
    else action = "hold";
    if (action === "buy") buys++;
    else if (action === "sell" || action === "exit") sells++;

    return {
      symbol: p.symbol,
      name: p.name,
      currentWeight,
      targetWeight,
      currentTotalWeight,
      targetTotalWeight,
      deltaWeight: targetWeight - currentWeight,
      dollarDelta,
      shares,
      price: p.price,
      sector: p.fundamentals?.sector ?? null,
      action,
    };
  });

  return {
    objective,
    constraints,
    metricsBefore,
    metricsAfter,
    positions,
    frontier: computeFrontier(ctx, cap),
    current: {
      vol: metricsBefore.volatility,
      ret: metricsBefore.expectedReturn,
    },
    target: { vol: metricsAfter.volatility, ret: metricsAfter.expectedReturn },
    turnover: turnoverAbs / 2,
    tradeCount: buys + sells,
    buys,
    sells,
    cashWeight: ctx.cashWeight,
  };
}
