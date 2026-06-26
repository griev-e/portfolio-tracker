import { describe, expect, it } from "vitest";
import type { FundamentalsPatch } from "@/lib/live/types";
import { applySnapshotPatches } from "./serialize";

const SAMPLE = `/**
 * Bundled fundamentals snapshot.
 * Price targets are anchored to market prices as of the snapshot date (2026-06-10).
 */
const ROWS: Row[] = [
  // ── Mega-cap ──
  { s: "AAPL", n: "Apple", sec: "Technology", ind: "Consumer Electronics", cap: 4310, beta: 1.1, vol: 0.26, dy: 0.004, roic: 0.46, rt: "Buy", pt: 318, an: 42, ins: "Selling", insNet: -180, ed: "2026-07-30", eu: 0.24, ap: 0.26, em: 0.08 },
  { s: "ZZZ", n: "Zeta Corp", sec: "Technology", ind: "Software", cap: 100, beta: 1.0, vol: 0.30 },
];
`;

function patch(symbol: string, p: Partial<FundamentalsPatch>): FundamentalsPatch {
  return { symbol, asOf: "2026-09-01T00:00:00.000Z", ...p };
}

function map(...patches: FundamentalsPatch[]): Map<string, FundamentalsPatch> {
  return new Map(patches.map((p) => [p.symbol, p]));
}

describe("applySnapshotPatches", () => {
  it("is a no-op (byte-identical) with no patches", () => {
    const { text, changes } = applySnapshotPatches(SAMPLE, new Map(), "2026-09-01");
    expect(text).toBe(SAMPLE);
    expect(changes).toHaveLength(0);
  });

  it("leaves values within tolerance untouched and doesn't bump the date", () => {
    const { text, changes } = applySnapshotPatches(
      SAMPLE,
      map(patch("AAPL", { beta: 1.105, volatility: 0.262 })), // both within tol
      "2026-09-01"
    );
    expect(text).toBe(SAMPLE);
    expect(changes).toHaveLength(0);
  });

  it("updates only the drifted token and stamps the new date", () => {
    const { text, changes } = applySnapshotPatches(
      SAMPLE,
      map(patch("AAPL", { beta: 1.35 })),
      "2026-09-01"
    );
    expect(text).toContain("beta: 1.35,");
    // Neighboring tokens are byte-identical.
    expect(text).toContain("vol: 0.26,");
    expect(text).toContain("cap: 4310,");
    expect(text).toContain("snapshot date (2026-09-01)");
    expect(changes).toEqual([
      { symbol: "AAPL", key: "beta", from: "1.1", to: "1.35" },
    ]);
  });

  it("refreshes string fields (rating, insider signal, earnings date)", () => {
    const { text } = applySnapshotPatches(
      SAMPLE,
      map(
        patch("AAPL", {
          analyst: { rating: "Strong Buy" },
          insider: { signal: "Buying" },
          earningsDate: "2026-10-30",
        })
      ),
      "2026-09-01"
    );
    expect(text).toContain('rt: "Strong Buy",');
    expect(text).toContain('ins: "Buying",');
    expect(text).toContain('ed: "2026-10-30",');
  });

  it("maps marketCap to $B and insider net to $M", () => {
    const { text, changes } = applySnapshotPatches(
      SAMPLE,
      map(
        patch("AAPL", {
          marketCap: 3_900_000_000_000,
          insider: { netActivity6m: -250_000_000 },
        })
      ),
      "2026-09-01"
    );
    expect(text).toContain("cap: 3900,");
    expect(text).toContain("insNet: -250,");
    expect(changes.map((c) => c.key).sort()).toEqual(["cap", "insNet"]);
  });

  it("never adds a key the row doesn't already carry", () => {
    // ZZZ has no eu/ap/em/dy keys — a region/dividend patch must not insert them.
    const { text, changes } = applySnapshotPatches(
      SAMPLE,
      map(patch("ZZZ", { regions: { Europe: 0.3 }, dividendYield: 0.02 })),
      "2026-09-01"
    );
    expect(text).toBe(SAMPLE); // unchanged
    expect(changes).toHaveLength(0);
  });

  it("ignores patches for symbols not in the snapshot", () => {
    const { text, changes } = applySnapshotPatches(
      SAMPLE,
      map(patch("TSLA", { beta: 2.2 })),
      "2026-09-01"
    );
    expect(text).toBe(SAMPLE);
    expect(changes).toHaveLength(0);
  });

  it("does not confuse the `ins` and `insNet` keys", () => {
    const { text } = applySnapshotPatches(
      SAMPLE,
      map(patch("AAPL", { insider: { signal: "Neutral", netActivity6m: -90_000_000 } })),
      "2026-09-01"
    );
    expect(text).toContain('ins: "Neutral",');
    expect(text).toContain("insNet: -90,");
  });
});
