import { SPX } from "../data/benchmarks";
import { UNKNOWN_DEFAULTS } from "../data/fundamentals";
import type {
  Portfolio,
  ScenarioImpact,
  ScenarioResult,
  ScenarioShock,
} from "../types";
import { corrInputs, pairCorrelation } from "./correlation";

/**
 * Scenario engine. Three shock types:
 *
 * stock  — an idiosyncratic move in one holding. The named position takes the
 *          full shock; everything else moves through the estimated correlation
 *          link, damped by λ because a company-specific event propagates only
 *          partially: Δ_j = λ ρ_ij (σ_j / σ_i) Δ_i.
 * market — a broad equity move; each holding moves by its beta.
 * rates  — a parallel shift in rates (magnitude in % points). Equities behave
 *          like long-duration assets: baseline sensitivity is −3.5% per +100bp,
 *          scaled by relative valuation (high-multiple ⇒ longer duration) and
 *          adjusted by sector (banks benefit from rates; utilities/REITs are
 *          bond proxies). Unprofitable companies use a 1.7× duration premium.
 */

const SPILLOVER_LAMBDA = 0.45;
const RATE_BETA_BASE = -0.035; // market move per +100bp

export function runScenario(
  portfolio: Portfolio,
  shock: ScenarioShock,
  label: string
): ScenarioResult {
  const ps = portfolio.positions;
  const inputs = ps.map(corrInputs);

  const impacts: ScenarioImpact[] = ps.map((p, i) => {
    const f = p.fundamentals;
    const beta = f?.beta ?? UNKNOWN_DEFAULTS.beta;
    let shockPct = 0;
    let isDirect = false;

    if (shock.kind === "stock") {
      const sourceIdx = ps.findIndex((x) => x.symbol === shock.symbol);
      if (p.symbol === shock.symbol) {
        shockPct = shock.magnitude;
        isDirect = true;
      } else if (sourceIdx >= 0) {
        const src = inputs[sourceIdx];
        const self = inputs[i];
        const rho = pairCorrelation(src, self);
        shockPct =
          SPILLOVER_LAMBDA * rho * (self.vol / src.vol) * shock.magnitude;
      }
    } else if (shock.kind === "market") {
      shockPct = beta * shock.magnitude;
      isDirect = true;
    } else {
      // rates
      const pe = f?.forwardPE ?? null;
      const valuationStretch =
        pe === null
          ? 1.7
          : Math.pow(Math.max(pe, 5) / SPX.forwardPE, 0.85);
      let sectorAdj = 1;
      const sector = f?.sector ?? "Unknown";
      if (sector === "Financials") sectorAdj = 0.25; // net beneficiaries
      if (sector === "Utilities" || sector === "Real Estate") sectorAdj = 1.6;
      if (sector === "Consumer Staples") sectorAdj = 0.8;
      shockPct = RATE_BETA_BASE * shock.magnitude * valuationStretch * sectorAdj;
      isDirect = true;
    }

    return {
      symbol: p.symbol,
      name: p.name,
      weight: p.weight,
      shockPct,
      dollarImpact: p.equity * shockPct,
      isDirect,
    };
  });

  const dollarImpact = impacts.reduce((s, x) => s + x.dollarImpact, 0);
  return {
    label,
    portfolioImpactPct:
      portfolio.totalValue > 0 ? dollarImpact / portfolio.totalValue : 0,
    dollarImpact,
    newTotalValue: portfolio.totalValue + dollarImpact,
    impacts: impacts.sort((a, b) => a.dollarImpact - b.dollarImpact),
  };
}

export interface ScenarioPreset {
  id: string;
  label: string;
  detail: string;
  shock: ScenarioShock;
}

/** Presets adapt to the portfolio: single-stock shocks target the largest holdings. */
export function scenarioPresets(portfolio: Portfolio): ScenarioPreset[] {
  const presets: ScenarioPreset[] = [];
  const tsla = portfolio.positions.find((p) => p.symbol === "TSLA");
  const target = tsla ?? portfolio.positions[0];
  if (target) {
    presets.push({
      id: `${target.symbol}-20`,
      label: `${target.symbol} −20%`,
      detail: `Idiosyncratic drawdown in ${target.name}, with correlated spillover`,
      shock: { kind: "stock", symbol: target.symbol, magnitude: -0.2 },
    });
  }
  const second = portfolio.positions.find((p) => p.symbol !== target?.symbol);
  if (second) {
    presets.push({
      id: `${second.symbol}-30`,
      label: `${second.symbol} −30%`,
      detail: `Severe single-name shock in ${second.name}`,
      shock: { kind: "stock", symbol: second.symbol, magnitude: -0.3 },
    });
  }
  presets.push(
    {
      id: "mkt-10",
      label: "Market −10%",
      detail: "Garden-variety correction; each holding moves by its beta",
      shock: { kind: "market", magnitude: -0.1 },
    },
    {
      id: "mkt-20",
      label: "Market −20%",
      detail: "Bear-market threshold drawdown",
      shock: { kind: "market", magnitude: -0.2 },
    },
    {
      id: "mkt-35",
      label: "2008 Replay −35%",
      detail: "Systemic crisis: GFC-magnitude broad equity decline",
      shock: { kind: "market", magnitude: -0.35 },
    },
    {
      id: "rates+1",
      label: "Rates +100bp",
      detail: "Parallel shift up; long-duration growth compresses hardest",
      shock: { kind: "rates", magnitude: 1 },
    },
    {
      id: "rates-0.5",
      label: "Rates −50bp",
      detail: "Easing surprise; duration assets re-rate higher",
      shock: { kind: "rates", magnitude: -0.5 },
    },
    {
      id: "mkt+10",
      label: "Melt-up +10%",
      detail: "Risk-on rally; high-beta names lead",
      shock: { kind: "market", magnitude: 0.1 },
    }
  );
  return presets;
}
