import type { Fundamentals, Portfolio, Position } from "../types";
import { factorScores } from "./factors";

/**
 * Rebalancing / cash-deployment engine.
 *
 * One group-based model powers three targeting bases. Per-holding is just the
 * degenerate case where every position is its own group of one; sector and
 * style bucket positions together. We only ever trade tickers already owned —
 * a group's dollar move is split across its members in proportion to current
 * equity, so the mix *within* a bucket is preserved.
 *
 * Two modes:
 *   deploy — add new cash and buy only (no sells). Cash flows to underweight
 *            buckets to close the gap to target; if the contribution can't fill
 *            every gap it's poured in proportionally (water toward targets).
 *            This is tax-efficient cash-flow rebalancing.
 *   full   — buy and sell to hit the target weights exactly.
 */

export type TargetBasis = "holding" | "sector" | "style";
export type RebalanceMode = "deploy" | "full";

export type Style = "Growth" | "Value" | "Dividend" | "Momentum" | "Low Vol";

export interface RebalanceGroup {
  id: string;
  label: string;
  members: string[]; // owned symbols, ≥1
  currentValue: number; // $ on the invested (ex-cash) book
  currentWeight: number; // fraction of invested book
}

export interface TradeOrder {
  symbol: string;
  name: string;
  price: number;
  action: "buy" | "sell" | "hold";
  dollars: number; // absolute $ traded
  shares: number; // absolute share count (fractional unless wholeShares)
  groupId: string;
  currentWeight: number; // ex-cash, before
  projectedWeight: number; // ex-cash, after
}

export interface GroupResult {
  id: string;
  label: string;
  currentWeight: number;
  targetWeight: number;
  projectedWeight: number;
  deltaValue: number; // signed $ moved into (+) or out of (−) the bucket
}

export interface RebalancePlan {
  mode: RebalanceMode;
  basis: TargetBasis;
  contribution: number;
  cashDeployed: number; // net $ put to work (buys − sells)
  leftoverCash: number; // intended-to-deploy dollars left unspent
  newCash: number;
  newInvested: number;
  newTotalValue: number;
  buyTotal: number;
  sellTotal: number;
  tradeCount: number;
  /** One-way turnover: Σ|trades| / 2 / invested book — matches the optimizer's
   *  definition so the two pages report the same convention. */
  turnover: number;
  driftBefore: number; // Σ|groupWeight − target|
  driftAfter: number;
  groups: GroupResult[];
  orders: TradeOrder[];
}

export interface RebalanceOptions {
  basis: TargetBasis;
  targets: Record<string, number>; // weights per group id (any scale; normalized)
  contribution: number;
  mode: RebalanceMode;
  alsoDeployCash: boolean; // also put existing idle cash to work
  wholeShares: boolean;
}

const EPS = 0.005; // sub-cent trades are noise

function logistic(x: number, mid: number, spread: number): number {
  return 100 / (1 + Math.exp(-(x - mid) / spread));
}

/** Dominant style bucket for a holding, reusing the shared factor scores. */
function classifyStyle(f: Fundamentals | null): Style | "Unclassified" {
  if (!f) return "Unclassified";
  const fs = factorScores(f);
  const dividend = logistic(f.dividendYield, 0.022, 0.012);
  const lowVol = 100 - logistic(f.volatility, 0.28, 0.1);
  const ranked: [Style, number][] = [
    ["Growth", fs.growth],
    ["Value", fs.value],
    ["Momentum", fs.momentum],
    ["Dividend", dividend],
    ["Low Vol", lowVol],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  return ranked[0][0];
}

function groupKey(p: Position, basis: TargetBasis): string {
  if (basis === "holding") return p.symbol;
  if (basis === "sector") return p.fundamentals?.sector ?? "Unknown";
  return classifyStyle(p.fundamentals);
}

/** Bucket the invested book by the chosen basis. */
export function buildGroups(
  portfolio: Portfolio,
  basis: TargetBasis
): RebalanceGroup[] {
  const equityValue = portfolio.equityValue || 1;
  const byKey = new Map<string, { label: string; members: string[]; value: number }>();

  for (const p of portfolio.positions) {
    const key = groupKey(p, basis);
    const label = basis === "holding" ? p.symbol : key;
    const g = byKey.get(key) ?? { label, members: [], value: 0 };
    g.members.push(p.symbol);
    g.value += p.equity;
    byKey.set(key, g);
  }

  return [...byKey.entries()]
    .map(([id, g]) => ({
      id,
      label: g.label,
      members: g.members,
      currentValue: g.value,
      currentWeight: g.value / equityValue,
    }))
    .sort((a, b) => b.currentValue - a.currentValue);
}

/** Targets that simply hold today's mix (deploying cash keeps current weights). */
export function currentTargets(groups: RebalanceGroup[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of groups) out[g.id] = g.currentWeight * 100;
  return out;
}

/** Equal-weight targets across the buckets. */
export function equalTargets(groups: RebalanceGroup[]): Record<string, number> {
  const out: Record<string, number> = {};
  const w = groups.length > 0 ? 100 / groups.length : 0;
  for (const g of groups) out[g.id] = w;
  return out;
}

export function planRebalance(
  portfolio: Portfolio,
  opts: RebalanceOptions
): RebalancePlan {
  const { basis, mode, wholeShares } = opts;
  const groups = buildGroups(portfolio, basis);
  const equityValue = portfolio.equityValue;
  const cash = portfolio.cash;
  const contribution = Math.max(0, opts.contribution);
  const deployable = contribution + (opts.alsoDeployCash ? cash : 0);

  // Normalize targets to fractions; fall back to current mix if unset.
  const rawSum = groups.reduce((s, g) => s + Math.max(0, opts.targets[g.id] ?? 0), 0);
  const target = (g: RebalanceGroup) =>
    rawSum > 1e-9 ? Math.max(0, opts.targets[g.id] ?? 0) / rawSum : g.currentWeight;

  // Reference book size if the whole deployable amount were invested.
  const base = equityValue + deployable;

  // Dollar move per group.
  const groupTrade = new Map<string, number>();
  if (mode === "deploy") {
    const shortfall = new Map<string, number>();
    let totalShortfall = 0;
    for (const g of groups) {
      const s = Math.max(0, target(g) * base - g.currentValue);
      shortfall.set(g.id, s);
      totalShortfall += s;
    }
    const scale =
      totalShortfall > deployable && totalShortfall > 0
        ? deployable / totalShortfall
        : 1;
    for (const g of groups) groupTrade.set(g.id, (shortfall.get(g.id) ?? 0) * scale);
  } else {
    for (const g of groups) groupTrade.set(g.id, target(g) * base - g.currentValue);
  }

  // Split each group's move across members ∝ current equity, then size shares.
  const posBySymbol = new Map(portfolio.positions.map((p) => [p.symbol, p]));
  const tradeBySymbol = new Map<string, number>();
  for (const g of groups) {
    const move = groupTrade.get(g.id) ?? 0;
    const denom = g.currentValue;
    for (const sym of g.members) {
      const p = posBySymbol.get(sym)!;
      const share = denom > 0 ? p.equity / denom : 1 / g.members.length;
      let dollars = move * share;
      if (wholeShares && p.price > 0) {
        const sh = Math.floor(Math.abs(dollars) / p.price) * Math.sign(dollars);
        dollars = sh * p.price;
      }
      tradeBySymbol.set(sym, dollars);
    }
  }

  const newInvested =
    equityValue + [...tradeBySymbol.values()].reduce((s, d) => s + d, 0) || 1;

  let buyTotal = 0;
  let sellTotal = 0;
  const orders: TradeOrder[] = portfolio.positions.map((p) => {
    const d = tradeBySymbol.get(p.symbol) ?? 0;
    if (d > 0) buyTotal += d;
    else if (d < 0) sellTotal += -d;
    const newEquity = p.equity + d;
    return {
      symbol: p.symbol,
      name: p.name,
      price: p.price,
      action: d > EPS ? "buy" : d < -EPS ? "sell" : "hold",
      dollars: Math.abs(d),
      shares: p.price > 0 ? Math.abs(d) / p.price : 0,
      groupId: groupKey(p, basis),
      currentWeight: equityValue > 0 ? p.equity / equityValue : 0,
      projectedWeight: newEquity / newInvested,
    };
  });
  orders.sort((a, b) => b.dollars - a.dollars);

  const cashDeployed = buyTotal - sellTotal;
  const newCash = cash + contribution - cashDeployed;
  const leftoverCash = Math.max(0, deployable - cashDeployed);

  // Projected group weights for the before→after picture.
  const projValue = new Map<string, number>();
  for (const g of groups) {
    let v = 0;
    for (const sym of g.members) {
      const p = posBySymbol.get(sym)!;
      v += p.equity + (tradeBySymbol.get(sym) ?? 0);
    }
    projValue.set(g.id, v);
  }

  let driftBefore = 0;
  let driftAfter = 0;
  const groupResults: GroupResult[] = groups.map((g) => {
    const t = target(g);
    const proj = (projValue.get(g.id) ?? 0) / newInvested;
    driftBefore += Math.abs(g.currentWeight - t);
    driftAfter += Math.abs(proj - t);
    return {
      id: g.id,
      label: g.label,
      currentWeight: g.currentWeight,
      targetWeight: t,
      projectedWeight: proj,
      deltaValue: groupTrade.get(g.id) ?? 0,
    };
  });

  return {
    mode,
    basis,
    contribution,
    cashDeployed,
    leftoverCash,
    newCash,
    newInvested,
    newTotalValue: portfolio.totalValue + contribution,
    buyTotal,
    sellTotal,
    tradeCount: orders.filter((o) => o.action !== "hold").length,
    turnover: equityValue > 0 ? (buyTotal + sellTotal) / 2 / equityValue : 0,
    driftBefore,
    driftAfter,
    groups: groupResults,
    orders,
  };
}
