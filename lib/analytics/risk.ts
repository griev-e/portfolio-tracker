import { getCMA } from "../live/cma";
import type { Portfolio, Region, Sector } from "../types";
import { covarianceMatrix, coveredPositions } from "./correlation";

export interface SectorExposure {
  sector: Sector;
  weight: number; // of total portfolio (look-through for funds)
  benchmarkWeight: number;
}

export interface RegionExposure {
  region: Region;
  weight: number;
}

export interface RiskContribution {
  symbol: string;
  name: string;
  weight: number;
  /** Share of total portfolio variance attributable to this position. */
  share: number;
  standalone: number; // w_i × σ_i
}

export interface RiskReport {
  topWeight: number;
  top3Weight: number;
  top5Weight: number;
  /** Herfindahl–Hirschman index on invested (ex-cash) weights. */
  hhi: number;
  effectiveN: number;
  sectors: SectorExposure[];
  regions: RegionExposure[];
  beta: number; // total portfolio incl. cash drag
  volatility: number; // annualized, total portfolio
  expectedReturn: number; // CAPM
  sharpe: number;
  /** Σwσ / σ_p on the invested book — >1 means diversification is working. */
  diversificationRatio: number;
  contributions: RiskContribution[];
  coveragePct: number; // weight of holdings with live fundamentals
}

export function riskReport(
  portfolio: Portfolio,
  benchmarkSectors: Partial<Record<Sector, number>>
): RiskReport {
  const CMA = getCMA();
  // Concentration is weight-only, so it spans every holding. The factor math
  // (beta, covariance, expected return) runs over the *covered* subset — names
  // with live fundamentals — with the excluded weight reported as coveragePct.
  const ps = portfolio.positions;
  const covered = coveredPositions(portfolio);
  const eqW = ps.map((p) => p.equityWeight);
  const sorted = [...eqW].sort((a, b) => b - a);

  const hhi = eqW.reduce((s, w) => s + w * w, 0);

  // Sector look-through on the invested book: funds spread across their
  // underlying mix (normalized so a fund's rows sum to its full weight).
  // Holdings with no live fundamentals are omitted (no sector to attribute).
  const sectorMap = new Map<Sector, number>();
  for (const p of ps) {
    const f = p.fundamentals;
    if (!f) continue;
    if (f.fund) {
      const entries = Object.entries(f.fund.sectorWeights);
      const sum = entries.reduce((s, [, w]) => s + (w ?? 0), 0) || 1;
      for (const [sec, w] of entries) {
        sectorMap.set(
          sec as Sector,
          (sectorMap.get(sec as Sector) ?? 0) + (p.equityWeight * (w ?? 0)) / sum
        );
      }
    } else {
      sectorMap.set(f.sector, (sectorMap.get(f.sector) ?? 0) + p.equityWeight);
    }
  }
  const sectors: SectorExposure[] = [...sectorMap.entries()]
    .map(([sector, weight]) => ({
      sector,
      weight,
      benchmarkWeight: benchmarkSectors[sector] ?? 0,
    }))
    .sort((a, b) => b.weight - a.weight);

  const regionMap = new Map<Region, number>();
  for (const p of ps) {
    const regions = p.fundamentals?.regions;
    if (!regions) continue;
    for (const [region, w] of Object.entries(regions)) {
      regionMap.set(
        region as Region,
        (regionMap.get(region as Region) ?? 0) + p.equityWeight * (w ?? 0)
      );
    }
  }
  const regions: RegionExposure[] = (
    ["US", "Europe", "Asia-Pacific", "Emerging"] as Region[]
  ).map((region) => ({ region, weight: regionMap.get(region) ?? 0 }));

  // Beta & volatility on total weights (cash has β = 0, σ = 0). Covariance is
  // indexed parallel to `covered`, so every weight vector here aligns to it.
  //
  // `covered` weights are still expressed as a fraction of the *whole* book
  // (including any no-data holdings), so a raw weighted sum over `covered`
  // alone would silently treat uncovered equity as if it were riskless cash —
  // dragging beta/volatility/expectedReturn toward zero by exactly the
  // uncovered weight instead of excluding it. `scale` renormalizes every such
  // sum onto the priced sub-portfolio (cash + covered names), so these figures
  // describe "what we can actually measure" with the gap reported separately
  // via `coveragePct`, rather than quietly imputing zero risk for the rest.
  const coverageWeight = covered.reduce((s, p) => s + p.weight, 0);
  const priced = coverageWeight + portfolio.cashWeight;
  const scale = priced > 0 ? 1 / priced : 0;

  const beta =
    scale *
    covered.reduce((s, p) => s + p.weight * (p.fundamentals?.beta ?? 0), 0);

  const cov = covarianceMatrix(portfolio);
  const w = covered.map((p) => p.weight * scale);
  let variance = 0;
  for (let i = 0; i < w.length; i++) {
    for (let j = 0; j < w.length; j++) {
      variance += w[i] * w[j] * cov[i][j];
    }
  }
  const volatility = Math.sqrt(Math.max(variance, 0));

  const expectedReturn =
    scale *
    (portfolio.cashWeight * CMA.riskFree +
      covered.reduce(
        (s, p) =>
          s +
          p.weight *
            (CMA.riskFree + (p.fundamentals?.beta ?? 0) * CMA.equityRiskPremium),
        0
      ));

  const sharpe =
    volatility > 0 ? (expectedReturn - CMA.riskFree) / volatility : 0;

  const weightedAvgVol = covered.reduce(
    (s, p) => s + p.equityWeight * (p.fundamentals?.volatility ?? 0),
    0
  );
  // Invested-book volatility for the diversification ratio (strip cash).
  const investedW = covered.map((p) => p.equityWeight);
  let investedVar = 0;
  for (let i = 0; i < investedW.length; i++) {
    for (let j = 0; j < investedW.length; j++) {
      investedVar += investedW[i] * investedW[j] * cov[i][j];
    }
  }
  const investedVol = Math.sqrt(Math.max(investedVar, 0));
  const diversificationRatio = investedVol > 0 ? weightedAvgVol / investedVol : 1;

  // Marginal risk contributions: RC_i = w_i (Σw)_i / σ², shares sum to 1.
  const contributions: RiskContribution[] = covered
    .map((p, i) => {
      const sigmaW = cov[i].reduce((s, c, j) => s + c * w[j], 0);
      return {
        symbol: p.symbol,
        name: p.name,
        weight: p.weight,
        share: variance > 0 ? (w[i] * sigmaW) / variance : 0,
        standalone: p.weight * (p.fundamentals?.volatility ?? 0),
      };
    })
    .sort((a, b) => b.share - a.share);

  const coveragePct = coverageWeight;

  return {
    topWeight: sorted[0] ?? 0,
    top3Weight: sorted.slice(0, 3).reduce((s, x) => s + x, 0),
    top5Weight: sorted.slice(0, 5).reduce((s, x) => s + x, 0),
    hhi,
    effectiveN: hhi > 0 ? 1 / hhi : 0,
    sectors,
    regions,
    beta,
    volatility,
    expectedReturn,
    sharpe,
    diversificationRatio,
    contributions,
    coveragePct,
  };
}
