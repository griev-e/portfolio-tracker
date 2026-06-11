import { buildContext } from "@/lib/analytics/regime/context";
import { buildRegimeReport } from "@/lib/analytics/regime/engine";
import type { Series } from "@/lib/analytics/regime/mathx";
import type { RegimeReport } from "@/lib/analytics/regime/types";
import { ALL_SYMBOLS } from "@/lib/analytics/regime/universe";
import { yf } from "./yahoo";

/**
 * Fetches the regime engine's market universe (daily closes), aligns it on
 * the S&P's trading calendar, and runs the engine. The whole report is cached
 * module-scope — the universe only moves once a day after the close.
 */

const REPORT_TTL = 10 * 60_000;

/**
 * Longest indicator window (252) + percentile lookback (252) + replay
 * history (126) + slack, in calendar days.
 */
const FETCH_DAYS = 960;

let cache: { at: number; report: RegimeReport } | null = null;
let inflight: Promise<RegimeReport> | null = null;

export async function getRegimeReport(): Promise<RegimeReport> {
  if (cache && Date.now() - cache.at < REPORT_TTL) return cache.report;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const report = await build();
      cache = { at: Date.now(), report };
      return report;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

interface Bar {
  date: string;
  close: number;
}

async function fetchBars(symbol: string): Promise<Bar[]> {
  const result = await yf.chart(symbol, {
    period1: new Date(Date.now() - FETCH_DAYS * 86_400_000),
    interval: "1d",
  });
  const bars: Bar[] = [];
  for (const q of result.quotes) {
    // Yahoo pads live/holiday rows with null closes — drop them.
    const close =
      typeof q.adjclose === "number" && Number.isFinite(q.adjclose)
        ? q.adjclose
        : typeof q.close === "number" && Number.isFinite(q.close)
          ? q.close
          : null;
    if (close === null || close <= 0) continue;
    bars.push({ date: q.date.toISOString().slice(0, 10), close });
  }
  return bars;
}

async function build(): Promise<RegimeReport> {
  const settled = await Promise.allSettled(ALL_SYMBOLS.map(fetchBars));

  const bySymbol = new Map<string, Bar[]>();
  const missing: string[] = [];
  ALL_SYMBOLS.forEach((symbol, i) => {
    const r = settled[i];
    if (r.status === "fulfilled" && r.value.length >= 200) {
      bySymbol.set(symbol, r.value);
    } else {
      missing.push(symbol);
    }
  });

  const spy = bySymbol.get("SPY");
  if (!spy) throw new Error("benchmark series (SPY) unavailable");

  // Master axis = SPY's trading calendar; everything else is keyed onto it.
  // Forward-fill inside an asset's life so one-day gaps don't poison windows.
  const dates = spy.map((b) => b.date);
  const series: Record<string, Series> = {};
  for (const [symbol, bars] of bySymbol) {
    const byDate = new Map(bars.map((b) => [b.date, b.close]));
    let last: number | null = null;
    series[symbol] = dates.map((d) => {
      const v = byDate.get(d);
      if (v !== undefined) last = v;
      return last;
    });
  }

  return buildRegimeReport(buildContext(dates, series), {
    requested: ALL_SYMBOLS.length,
    loaded: bySymbol.size,
    missing,
  });
}
