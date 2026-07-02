import { describe, expect, it } from "vitest";
import {
  ASSUMPTION_PRESETS,
  cloneAssumptions,
  matchPreset,
} from "./assumptions";

describe("matchPreset", () => {
  it("matches every preset via a clone (identity-independent)", () => {
    for (const p of ASSUMPTION_PRESETS) {
      expect(matchPreset(cloneAssumptions(p.values))).toBe(p.id);
    }
  });

  it("is key-order independent (structural, not stringify, equality)", () => {
    const p = ASSUMPTION_PRESETS[0];
    // Rebuild with reversed key insertion order — stringify equality would
    // report "Custom" here.
    const src = p.values;
    const shuffled = {
      ndx: { ...src.ndx },
      spx: { ...src.spx },
      dividendGrowth: src.dividendGrowth,
      equityRiskPremium: src.equityRiskPremium,
    };
    expect(matchPreset(shuffled)).toBe(p.id);
  });

  it("returns null for any edited value", () => {
    const edited = cloneAssumptions(ASSUMPTION_PRESETS[0].values);
    edited.spx.roic += 0.001;
    expect(matchPreset(edited)).toBeNull();
  });
});
