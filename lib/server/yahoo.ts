import YahooFinance from "yahoo-finance2";
import type {
  AnalystRating,
  InsiderSignal,
  Sector,
} from "@/lib/types";
import type { FundamentalsPatch, LiveQuote } from "@/lib/live/types";

/**
 * Server-side Yahoo Finance client (unofficial API via yahoo-finance2).
 * Only ever imported from route handlers — never ships to the browser.
 */
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/** Module-scope caches survive between invocations on warm lambdas. */
const quoteCache = new Map<string, { at: number; data: LiveQuote }>();
const fundCache = new Map<string, { at: number; data: FundamentalsPatch | null }>();
const QUOTE_TTL = 55_000;
const FUND_TTL = 12 * 3600_000;

export function sanitizeSymbols(raw: string | null, max = 30): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, ""))
        .filter((s) => s.length > 0 && s.length <= 12)
    ),
  ]
    .sort()
    .slice(0, max);
}

export async function fetchQuotes(
  symbols: string[]
): Promise<Record<string, LiveQuote>> {
  const now = Date.now();
  const out: Record<string, LiveQuote> = {};
  const missing: string[] = [];
  for (const s of symbols) {
    const hit = quoteCache.get(s);
    if (hit && now - hit.at < QUOTE_TTL) out[s] = hit.data;
    else missing.push(s);
  }
  if (missing.length > 0) {
    const results = await yf.quote(missing);
    const list = Array.isArray(results) ? results : [results];
    for (const q of list) {
      if (!q?.symbol || typeof q.regularMarketPrice !== "number") continue;

      // Extended-hours aware: outside the regular session, the latest pre- or
      // post-market trade is the price. Day change stays anchored to the
      // prior regular close, so it captures the full move since yesterday.
      const state = q.marketState ?? "REGULAR";
      let price = q.regularMarketPrice;
      let time: Date | undefined = q.regularMarketTime;
      if (state.startsWith("PRE") && typeof q.preMarketPrice === "number") {
        price = q.preMarketPrice;
        time = q.preMarketTime ?? time;
      } else if (
        state !== "REGULAR" &&
        typeof q.postMarketPrice === "number"
      ) {
        price = q.postMarketPrice;
        time = q.postMarketTime ?? time;
      }

      const quote: LiveQuote = {
        symbol: q.symbol,
        price,
        prevClose:
          typeof q.regularMarketPreviousClose === "number"
            ? q.regularMarketPreviousClose
            : null,
        asOf:
          time instanceof Date ? time.toISOString() : new Date().toISOString(),
      };
      out[q.symbol] = quote;
      quoteCache.set(q.symbol, { at: now, data: quote });
    }
  }
  return out;
}

const YAHOO_SECTOR: Record<string, Sector> = {
  Technology: "Technology",
  "Communication Services": "Communication Services",
  "Consumer Cyclical": "Consumer Discretionary",
  "Consumer Defensive": "Consumer Staples",
  "Financial Services": "Financials",
  Healthcare: "Health Care",
  Industrials: "Industrials",
  Energy: "Energy",
  "Basic Materials": "Materials",
  Utilities: "Utilities",
  "Real Estate": "Real Estate",
};

const ETF_SECTOR: Record<string, Sector> = {
  technology: "Technology",
  communication_services: "Communication Services",
  consumer_cyclical: "Consumer Discretionary",
  consumer_defensive: "Consumer Staples",
  financial_services: "Financials",
  healthcare: "Health Care",
  industrials: "Industrials",
  energy: "Energy",
  basic_materials: "Materials",
  utilities: "Utilities",
  realestate: "Real Estate",
};

const RATING: Record<string, AnalystRating> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  underperform: "Sell",
  sell: "Strong Sell",
};

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

export async function fetchFundamentalsPatch(
  symbol: string
): Promise<FundamentalsPatch | null> {
  const now = Date.now();
  const hit = fundCache.get(symbol);
  if (hit && now - hit.at < FUND_TTL) return hit.data;

  let patch: FundamentalsPatch | null = null;
  try {
    const s = await yf.quoteSummary(symbol, {
      modules: [
        "price",
        "assetProfile",
        "summaryDetail",
        "defaultKeyStatistics",
        "financialData",
        "calendarEvents",
        "insiderTransactions",
        "topHoldings",
      ],
    });

    const price = s.price;
    const profile = s.assetProfile;
    const detail = s.summaryDetail;
    const stats = s.defaultKeyStatistics as Record<string, unknown> | undefined;
    const fin = s.financialData;
    const isFund = price?.quoteType === "ETF" || price?.quoteType === "MUTUALFUND";

    const marketCap = num(price?.marketCap);
    const fcf = num(fin?.freeCashflow);

    // Insider flows over the trailing 6 months, classified from the filing text.
    let buys = 0;
    let sells = 0;
    let buyValue = 0;
    let sellValue = 0;
    const cutoff = now - 183 * 86_400_000;
    for (const t of s.insiderTransactions?.transactions ?? []) {
      const when = t.startDate instanceof Date ? t.startDate.getTime() : 0;
      if (when < cutoff) continue;
      const text = (t.transactionText ?? "").toLowerCase();
      const value = num(t.value) ?? 0;
      if (text.includes("sale")) {
        sells++;
        sellValue += value;
      } else if (text.includes("purchase") || text.includes("buy")) {
        buys++;
        buyValue += value;
      }
    }
    const netInsider = buyValue - sellValue;
    const insiderSignal: InsiderSignal =
      netInsider > 250_000 ? "Buying" : netInsider < -250_000 ? "Selling" : "Neutral";

    let fundSectorWeights: FundamentalsPatch["fundSectorWeights"];
    if (isFund && s.topHoldings?.sectorWeightings) {
      fundSectorWeights = {};
      for (const entry of s.topHoldings.sectorWeightings) {
        for (const [key, w] of Object.entries(entry)) {
          const sector = ETF_SECTOR[key];
          const weight = num(w);
          if (sector && weight && weight > 0.001) fundSectorWeights[sector] = weight;
        }
      }
      if (Object.keys(fundSectorWeights).length === 0) fundSectorWeights = undefined;
    }

    const earningsDate = s.calendarEvents?.earnings?.earningsDate?.[0];

    const targetMean = num(fin?.targetMeanPrice);
    const ratingKey = fin?.recommendationKey ?? "";

    patch = {
      symbol,
      asOf: new Date().toISOString(),
      name: price?.longName ?? price?.shortName ?? undefined,
      sector: isFund
        ? "Diversified"
        : profile?.sector
          ? (YAHOO_SECTOR[profile.sector] ?? undefined)
          : undefined,
      industry: isFund ? "Fund / ETF" : (profile?.industry ?? undefined),
      marketCap,
      beta: num(detail?.beta) ?? num(stats?.beta) ?? num(stats?.beta3Year),
      revenueGrowth: num(fin?.revenueGrowth),
      epsGrowth: num(fin?.earningsGrowth),
      forwardPE: num(stats?.forwardPE) ?? num(detail?.forwardPE),
      fcfYield: fcf && marketCap ? fcf / marketCap : undefined,
      operatingMargin: num(fin?.operatingMargins),
      grossMargin: num(fin?.grossMargins),
      dividendYield: num(detail?.dividendYield) ?? num(detail?.yield),
      return12m: num(stats?.["52WeekChange"]),
      analyst:
        targetMean || RATING[ratingKey]
          ? {
              rating: RATING[ratingKey],
              priceTarget: targetMean,
              targetLow: num(fin?.targetLowPrice),
              targetHigh: num(fin?.targetHighPrice),
              count: num(fin?.numberOfAnalystOpinions),
            }
          : undefined,
      insider:
        buys + sells > 0
          ? {
              signal: insiderSignal,
              netActivity6m: netInsider,
              buys6m: buys,
              sells6m: sells,
            }
          : undefined,
      earningsDate:
        earningsDate instanceof Date
          ? earningsDate.toISOString().slice(0, 10)
          : undefined,
      fundSectorWeights,
    };
  } catch {
    patch = null; // symbol unknown to Yahoo, or API drift — caller falls back
  }

  fundCache.set(symbol, { at: now, data: patch });
  return patch;
}
