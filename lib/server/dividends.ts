import type { DividendProfile } from "@/lib/analytics/dividends/types";
import { yf } from "./yahoo";

/**
 * Per-symbol dividend profiles: ~10.5 years of payment history plus the
 * safety inputs (payout ratio, FCF coverage, ROE). Pure market data — the
 * client joins it with the portfolio, so nothing personal touches the server.
 */

const TTL = 12 * 3600_000;
const HISTORY_YEARS = 10.5;

const cache = new Map<string, { at: number; data: DividendProfile | null }>();

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

async function fetchProfile(symbol: string): Promise<DividendProfile | null> {
  try {
    const period1 = new Date(
      Date.now() - HISTORY_YEARS * 365.25 * 86_400_000
    );
    const [chart, summary] = await Promise.all([
      yf.chart(symbol, { period1, interval: "1mo", events: "div" }),
      yf.quoteSummary(symbol, {
        modules: ["summaryDetail", "financialData", "defaultKeyStatistics", "price"],
      }),
    ]);

    const events = (chart.events?.dividends ?? [])
      .filter((d) => typeof d.amount === "number" && d.amount > 0)
      .map((d) => ({
        date: d.date.toISOString().slice(0, 10),
        amount: d.amount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const detail = summary.summaryDetail;
    const fin = summary.financialData;
    const stats = summary.defaultKeyStatistics as
      | Record<string, unknown>
      | undefined;
    const isFund =
      summary.price?.quoteType === "ETF" ||
      summary.price?.quoteType === "MUTUALFUND";

    const forwardRate = num(detail?.dividendRate);
    const payoutRatio = num(detail?.payoutRatio);
    const fcf = num(fin?.freeCashflow);
    const sharesOut = num(stats?.sharesOutstanding);

    // Total dividends paid vs free cash flow (stocks with full data only).
    let fcfPayout: number | null = null;
    if (!isFund && forwardRate !== null && fcf !== null && sharesOut !== null && fcf !== 0) {
      fcfPayout = (forwardRate * sharesOut) / fcf;
    }

    const profile: DividendProfile = {
      symbol,
      asOf: new Date().toISOString(),
      kind: isFund ? "fund" : "stock",
      forwardRate,
      payoutRatio: isFund ? null : payoutRatio,
      fcfPayout,
      events,
    };
    return profile;
  } catch {
    return null; // unknown symbol or API drift — engine estimates from yield
  }
}

export async function fetchDividendProfiles(
  symbols: string[]
): Promise<Record<string, DividendProfile | null>> {
  const now = Date.now();
  const out: Record<string, DividendProfile | null> = {};
  const missing: string[] = [];
  for (const s of symbols) {
    const hit = cache.get(s);
    if (hit && now - hit.at < TTL) out[s] = hit.data;
    else missing.push(s);
  }
  if (missing.length > 0) {
    const results = await Promise.all(missing.map(fetchProfile));
    missing.forEach((s, i) => {
      out[s] = results[i];
      cache.set(s, { at: now, data: results[i] });
    });
  }
  return out;
}
