import { describe, expect, it } from "vitest";
import type { Fundamentals } from "@/lib/types";
import { DEFAULT_BETA, estimatedVolatility, fromPatch, mergeFundamentals } from "./merge";
import type { FundamentalsPatch } from "./types";

const bundled: Fundamentals = {
  symbol: "AAA",
  name: "Alpha Inc",
  sector: "Technology",
  industry: "Software",
  regions: { US: 1 },
  marketCap: 1e11,
  beta: 1.1,
  volatility: 0.3,
  revenueGrowth: 0.1,
  epsGrowth: 0.12,
  fcfGrowth: 0.09,
  forwardPE: 25,
  fcfYield: 0.03,
  roic: 0.2,
  debtToEquity: 0.6,
  operatingMargin: 0.25,
  grossMargin: 0.6,
  dividendYield: 0,
  return12m: 0.15,
  analyst: { rating: "Buy", priceTarget: 120, targetLow: 90, targetHigh: 150, count: 20 },
  insider: { signal: "Neutral", netActivity6m: 0, buys6m: 0, sells6m: 0 },
  earningsDate: "2026-07-01",
};

function patch(p: Partial<FundamentalsPatch>): FundamentalsPatch {
  return { symbol: "AAA", asOf: "2026-06-26T00:00:00.000Z", ...p };
}

describe("mergeFundamentals provenance", () => {
  it("tags a pure-snapshot merge (no patch) as fallback", () => {
    const merged = mergeFundamentals(bundled, undefined);
    expect(merged).not.toBeNull();
    expect(merged!.provenance?.coverage).toBe("fallback");
    expect(merged!.provenance?.fields.beta).toBe("fallback");
    expect(merged!.provenance?.fields.volatility).toBe("fallback");
    expect(merged!.provenance?.fields.sector).toBe("fallback");
    // A snapshot-only merge is not "live".
    expect(merged!.live).toBeUndefined();
  });

  it("returns null when there's neither a bundle nor a patch", () => {
    expect(mergeFundamentals(null, undefined)).toBeNull();
  });

  it("marks coverage live when every critical field is from the patch", () => {
    const merged = mergeFundamentals(
      bundled,
      patch({ beta: 1.4, volatility: 0.42, sector: "Health Care" })
    );
    expect(merged!.beta).toBe(1.4);
    expect(merged!.volatility).toBe(0.42);
    expect(merged!.sector).toBe("Health Care");
    expect(merged!.provenance?.coverage).toBe("live");
    expect(merged!.provenance?.fields.beta).toBe("live");
    expect(merged!.provenance?.fields.sector).toBe("live");
    // A field the patch didn't supply stays fallback.
    expect(merged!.provenance?.fields.roic).toBe("fallback");
    expect(merged!.roic).toBe(bundled.roic);
    expect(merged!.live).toBe(true);
  });

  it("marks coverage partial when only some critical fields are live", () => {
    const merged = mergeFundamentals(bundled, patch({ beta: 1.4 }));
    expect(merged!.provenance?.coverage).toBe("partial");
    expect(merged!.provenance?.fields.beta).toBe("live");
    expect(merged!.provenance?.fields.volatility).toBe("fallback");
  });

  it("maps the fund sector-weights patch key to the `fund` field source", () => {
    const merged = mergeFundamentals(
      bundled,
      patch({ fundSectorWeights: { Technology: 1 } })
    );
    expect(merged!.provenance?.fields.fund).toBe("live");
    expect(merged!.fund?.sectorWeights.Technology).toBe(1);
  });

  it("builds provenance for an unknown ticker promoted from a patch", () => {
    const merged = mergeFundamentals(
      null,
      patch({ symbol: "ZZZ", beta: 0.8, volatility: 0.25, sector: "Utilities" })
    );
    expect(merged!.symbol).toBe("ZZZ");
    expect(merged!.provenance?.coverage).toBe("live");
    expect(merged!.provenance?.fields.beta).toBe("live");
    // Defaulted fields (no patch value) are fallback, not live.
    expect(merged!.provenance?.fields.roic).toBe("fallback");
    expect(merged!.live).toBe(true);
  });

  it("overlays a partial insider patch field-by-field over the bundle", () => {
    const merged = mergeFundamentals(
      bundled,
      patch({ insider: { signal: "Buying", buys6m: 12 } })
    );
    // Supplied fields win…
    expect(merged!.insider.signal).toBe("Buying");
    expect(merged!.insider.buys6m).toBe(12);
    // …omitted ones fall back to the bundle.
    expect(merged!.insider.netActivity6m).toBe(bundled.insider.netActivity6m);
    expect(merged!.insider.sells6m).toBe(bundled.insider.sells6m);
    expect(merged!.provenance?.fields.insider).toBe("live");
  });

  it("keeps the bundled insider block when the patch omits it", () => {
    const merged = mergeFundamentals(bundled, patch({ beta: 1.3 }));
    expect(merged!.insider).toEqual(bundled.insider);
    expect(merged!.provenance?.fields.insider).toBe("fallback");
  });

  it("attaches fund sector weights when promoting an unknown ETF from a patch", () => {
    const merged = mergeFundamentals(
      null,
      patch({ symbol: "XYZ", fundSectorWeights: { Technology: 0.6, Financials: 0.4 } })
    );
    expect(merged!.fund?.sectorWeights).toEqual({ Technology: 0.6, Financials: 0.4 });
    expect(merged!.provenance?.fields.fund).toBe("live");
  });

  it("leaves an unknown non-fund ticker without a fund block", () => {
    const merged = mergeFundamentals(null, patch({ symbol: "XYZ", beta: 1.1 }));
    expect(merged!.fund).toBeUndefined();
    expect(merged!.provenance?.fields.fund).toBe("fallback");
  });
});

describe("fromPatch (exported for display-only estimates)", () => {
  it("synthesizes a fully-estimated profile from a near-empty patch, tagged fallback throughout", () => {
    // This is exactly what the Research page does for a real (quoted) ticker
    // whose fundamentals fetch returned nothing — display-only, never fed into
    // a Position's `fundamentals`, so it can't affect the portfolio risk math.
    const est = fromPatch({ symbol: "ZZZZ", asOf: "2026-06-30T00:00:00.000Z" });
    expect(est.beta).toBe(DEFAULT_BETA);
    expect(est.volatility).toBe(estimatedVolatility(DEFAULT_BETA));
    expect(est.provenance?.coverage).toBe("fallback");
    expect(est.provenance?.fields.beta).toBe("fallback");
    expect(est.provenance?.fields.volatility).toBe("fallback");
    expect(est.provenance?.fields.sector).toBe("fallback");
  });

  it("derives the volatility estimate from beta when only beta is supplied", () => {
    const est = fromPatch({ symbol: "ZZZZ", asOf: "2026-06-30T00:00:00.000Z", beta: 1.6 });
    expect(est.beta).toBe(1.6);
    expect(est.volatility).toBeCloseTo(0.12 + 0.16 * 1.6, 6);
    expect(est.provenance?.fields.beta).toBe("live");
    expect(est.provenance?.fields.volatility).toBe("fallback");
  });
});
