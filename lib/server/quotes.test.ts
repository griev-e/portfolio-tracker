import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * fetchQuotes poison-pill behavior: when the *batch* quote call rejects
 * (yahoo-finance2 throws for the whole batch if one symbol is bad), the
 * fetcher must isolate the failure per symbol — good symbols still price,
 * the bad one is negative-cached so the book heals — and a full provider
 * outage must NOT negative-cache anything (retried next poll instead).
 */

const quoteMock = vi.hoisted(() => vi.fn());

vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = quoteMock;
    quoteSummary = vi.fn();
    chart = vi.fn();
    search = vi.fn();
  },
}));

import { fetchQuotes } from "./yahoo";

const goodRow = (symbol: string, price: number) => ({
  symbol,
  regularMarketPrice: price,
  regularMarketPreviousClose: price - 1,
  regularMarketTime: new Date("2026-07-01T20:00:00Z"),
  marketState: "REGULAR",
});

beforeEach(() => {
  quoteMock.mockReset();
});

describe("fetchQuotes batch-failure isolation", () => {
  it("recovers good symbols per-symbol when the batch rejects", async () => {
    quoteMock.mockImplementation((arg: string | string[]) => {
      if (Array.isArray(arg)) return Promise.reject(new Error("bad symbol in batch"));
      if (arg === "DEADX") return Promise.reject(new Error("unknown symbol"));
      return Promise.resolve(goodRow(arg, 100));
    });
    const out = await fetchQuotes(["AAPL", "DEADX", "MSFT"], true);
    expect(out.AAPL?.price).toBe(100);
    expect(out.MSFT?.price).toBe(100);
    expect(out.DEADX).toBeUndefined();

    // The poison pill is now negative-cached: a follow-up (non-forced) fetch
    // must not re-request it, and the good symbols keep pricing.
    quoteMock.mockClear();
    quoteMock.mockImplementation((arg: string | string[]) => {
      // If DEADX were re-batched this would reject again and mask the fix.
      if (Array.isArray(arg) && arg.includes("DEADX")) {
        return Promise.reject(new Error("still bad"));
      }
      return Promise.resolve(
        (Array.isArray(arg) ? arg : [arg]).map((s) => goodRow(s, 101))
      );
    });
    const again = await fetchQuotes(["AAPL", "DEADX", "MSFT"]);
    expect(again.AAPL).toBeDefined();
    expect(again.MSFT).toBeDefined();
    expect(again.DEADX).toBeUndefined();
    const batchArgs = quoteMock.mock.calls
      .map((c) => c[0])
      .filter((a): a is string[] => Array.isArray(a))
      .flat();
    expect(batchArgs).not.toContain("DEADX");
  });

  it("does not negative-cache anything on a full provider outage", async () => {
    quoteMock.mockRejectedValue(new Error("provider down"));
    const out = await fetchQuotes(["OUT1", "OUT2"], true);
    expect(out).toEqual({});

    // Provider recovers: the very next forced fetch must retry both symbols
    // (nothing was negative-cached during the outage).
    quoteMock.mockReset();
    quoteMock.mockImplementation((arg: string | string[]) =>
      Promise.resolve(
        (Array.isArray(arg) ? arg : [arg]).map((s) => goodRow(s, 55))
      )
    );
    const recovered = await fetchQuotes(["OUT1", "OUT2"], true);
    expect(recovered.OUT1?.price).toBe(55);
    expect(recovered.OUT2?.price).toBe(55);
  });
});
