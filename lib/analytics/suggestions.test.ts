import { describe, expect, it } from "vitest";
import { holding, makePortfolio } from "../__tests__/factory";
import {
  availableSectors,
  suggestionReport,
  type Suggestion,
} from "./suggestions";

/** A tech-heavy, concentrated book — mirrors the typical user this app serves. */
function techHeavyBook() {
  return makePortfolio(
    [
      holding({ symbol: "AAPL", shares: 100, price: 200 }),
      holding({ symbol: "MSFT", shares: 50, price: 400 }),
      holding({ symbol: "NVDA", shares: 60, price: 150 }),
    ],
    10_000
  );
}

const find = (s: Suggestion[], sym: string) => s.find((x) => x.symbol === sym);

describe("suggestionReport", () => {
  it("never suggests a name you already hold", () => {
    const { suggestions } = suggestionReport(techHeavyBook());
    const held = new Set(["AAPL", "MSFT", "NVDA"]);
    expect(suggestions.some((s) => held.has(s.symbol))).toBe(false);
  });

  it("is sorted by composite score, descending", () => {
    const { suggestions } = suggestionReport(techHeavyBook());
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].score).toBeGreaterThanOrEqual(suggestions[i].score);
    }
  });

  it("scores and reasons every suggestion", () => {
    const { suggestions } = suggestionReport(techHeavyBook());
    expect(suggestions.length).toBeGreaterThan(20);
    for (const s of suggestions) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
      expect(s.reasons.length).toBeGreaterThan(0);
      expect(s.reasons.length).toBeLessThanOrEqual(3);
    }
  });

  it("is deterministic — same book, same ranking", () => {
    const a = suggestionReport(techHeavyBook()).suggestions.map((s) => s.symbol);
    const b = suggestionReport(techHeavyBook()).suggestions.map((s) => s.symbol);
    expect(a).toEqual(b);
  });

  it("rewards portfolio fit: an out-of-book sector outranks the same-quality crowded one", () => {
    // A tech-only book is underweight Health Care and overweight Technology.
    // Compare a strong Health Care name's fit vs a strong Tech name's fit.
    const { suggestions } = suggestionReport(techHeavyBook());
    const lly = find(suggestions, "LLY"); // Health Care, high quality
    const avgo = find(suggestions, "AVGO"); // Technology, high quality
    expect(lly).toBeDefined();
    expect(avgo).toBeDefined();
    expect(lly!.subScores.fit).toBeGreaterThan(avgo!.subScores.fit);
  });

  it("surfaces a diversifying ETF for a concentrated book", () => {
    const { suggestions } = suggestionReport(techHeavyBook());
    const vti = find(suggestions, "VTI");
    expect(vti).toBeDefined();
    // High concentration → strong fit for a total-market fund.
    expect(vti!.subScores.fit).toBeGreaterThan(60);
    expect(vti!.reasons.some((r) => r.kind === "fit")).toBe(true);
  });

  it("filters by sector", () => {
    const { suggestions } = suggestionReport(techHeavyBook(), {
      sector: "Health Care",
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.sector === "Health Care")).toBe(true);
  });

  it("honors the limit option", () => {
    const { suggestions } = suggestionReport(techHeavyBook(), { limit: 5 });
    expect(suggestions.length).toBe(5);
  });

  it("computes sector gaps with the most underweight first", () => {
    const { context } = suggestionReport(techHeavyBook());
    expect(context.gaps[0].gap).toBeGreaterThanOrEqual(
      context.gaps[context.gaps.length - 1].gap
    );
    // A tech-only book is underweight everything-but-tech, so the top gap is positive.
    expect(context.gaps[0].gap).toBeGreaterThan(0);
    expect(context.concentration).toBeGreaterThan(0);
  });

  it("availableSectors excludes nothing held-only and returns real sectors", () => {
    const sectors = availableSectors(techHeavyBook());
    expect(sectors).toContain("Health Care");
    expect(sectors).toContain("Diversified");
    expect(sectors.length).toBeGreaterThan(3);
  });
});
