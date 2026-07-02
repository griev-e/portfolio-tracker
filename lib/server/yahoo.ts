import YahooFinance from "yahoo-finance2";
import type {
  AnalystRating,
  InsiderSignal,
  Sector,
} from "@/lib/types";
import type { FundamentalsPatch, LiveQuote } from "@/lib/live/types";
import type { HistoryRange, HistorySeries, SymbolHit } from "@/lib/research/types";

/**
 * Server-side Yahoo Finance client (unofficial API via yahoo-finance2).
 * Only ever imported from route handlers — never ships to the browser.
 */
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
export { yf };

/** Module-scope caches survive between invocations on warm lambdas. */
// `data: null` is a negative-cache entry — a symbol Yahoo returned nothing for
// (delisted / unknown), backed off longer so it doesn't re-hit the provider on
// every 60s poll the way an uncached miss would.
const quoteCache = new Map<string, { at: number; data: LiveQuote | null }>();
const fundCache = new Map<string, { at: number; data: FundamentalsPatch | null }>();
const searchCache = new Map<string, { at: number; data: SymbolHit[] }>();
const historyCache = new Map<string, { at: number; data: HistorySeries | null }>();
// Slightly longer than the client's 60s poll (lib/live/useLiveData.ts) so the
// steady-state poll can hit this warm-lambda cache instead of always missing.
const QUOTE_TTL = 65_000;
const QUOTE_NEG_TTL = 10 * 60_000;
const FUND_TTL = 12 * 3600_000;
const SEARCH_TTL = 6 * 3600_000;
const HISTORY_TTL = 10 * 60_000;

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
  symbols: string[],
  force = false
): Promise<Record<string, LiveQuote>> {
  const now = Date.now();
  const out: Record<string, LiveQuote> = {};
  const missing: string[] = [];
  for (const s of symbols) {
    const hit = quoteCache.get(s);
    const ttl = hit?.data === null ? QUOTE_NEG_TTL : QUOTE_TTL;
    if (!force && hit && now - hit.at < ttl) {
      if (hit.data) out[s] = hit.data; // else a fresh negative hit — skip, don't re-request
    } else {
      missing.push(s);
    }
  }
  if (missing.length > 0) {
    // Partial-failure safe: a single bad/delisted ticker makes yf.quote reject
    // for the whole batch. When that happens, fall back to per-symbol fetches
    // so one poison pill can't black out live prices for the entire book (the
    // old behavior on a cold cache), and the bad symbol itself gets negative-
    // cached so the book heals instead of re-failing every poll.
    let batchOk = false;
    const resolved = new Set<string>();
    const ingest = (q: unknown): void => {
      const quote = toLiveQuote(q);
      if (!quote) return;
      out[quote.symbol] = quote;
      quoteCache.set(quote.symbol, { at: now, data: quote });
      resolved.add(quote.symbol);
    };
    try {
      const results = await yf.quote(missing);
      batchOk = true;
      const list = Array.isArray(results) ? results : [results];
      for (const q of list) ingest(q);
    } catch {
      // Batch rejected — isolate the poison pill: resolve each symbol on its
      // own (bounded fan-out; `missing` is already capped by sanitizeSymbols).
      // Negative-caching below only kicks in when at least one single call got
      // through, so a full provider outage (every single rejects) stays
      // uncached and is retried on the next poll instead of blacking out the
      // book for the negative-cache TTL.
      const singles = await Promise.allSettled(missing.map((s) => yf.quote(s)));
      batchOk = singles.some((r) => r.status === "fulfilled");
      singles.forEach((r) => {
        if (r.status === "fulfilled") ingest(r.value);
      });
    }
    // Negative-cache the symbols the provider conclusively returned nothing
    // for, so a delisted/unknown ticker backs off instead of re-hitting the
    // provider every poll.
    if (batchOk) {
      for (const s of missing) {
        if (!resolved.has(s)) quoteCache.set(s, { at: now, data: null });
      }
    }
  }
  return out;
}

/**
 * Map one raw Yahoo quote to a LiveQuote, extended-hours aware: outside the
 * regular session the latest pre-/post-market trade is the price, while day
 * change stays anchored to the prior regular close so it captures the full
 * move since yesterday. Null when the row is unusable.
 */
function toLiveQuote(raw: unknown): LiveQuote | null {
  const q = raw as {
    symbol?: string;
    regularMarketPrice?: number;
    regularMarketPreviousClose?: number;
    regularMarketTime?: Date;
    marketState?: string;
    preMarketPrice?: number;
    preMarketTime?: Date;
    postMarketPrice?: number;
    postMarketTime?: Date;
  } | null;
  if (!q?.symbol || typeof q.regularMarketPrice !== "number") return null;

  const state = q.marketState ?? "REGULAR";
  let price = q.regularMarketPrice;
  let time: Date | undefined = q.regularMarketTime;
  if (state.startsWith("PRE") && typeof q.preMarketPrice === "number") {
    price = q.preMarketPrice;
    time = q.preMarketTime ?? time;
  } else if (state !== "REGULAR" && typeof q.postMarketPrice === "number") {
    price = q.postMarketPrice;
    time = q.postMarketTime ?? time;
  }

  return {
    symbol: q.symbol,
    price,
    prevClose:
      typeof q.regularMarketPreviousClose === "number"
        ? q.regularMarketPreviousClose
        : null,
    asOf: time instanceof Date ? time.toISOString() : new Date().toISOString(),
  };
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

/** Annualized realized volatility from a close series (daily bars → ×√252). */
export function annualizedVol(closes: number[]): number | undefined {
  if (closes.length < 20) return undefined;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < 19) return undefined;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  const vol = Math.sqrt(variance) * Math.sqrt(252);
  return Number.isFinite(vol) && vol > 0 ? vol : undefined;
}

async function fetchVolatility(symbol: string): Promise<number | undefined> {
  const series = await fetchHistory(symbol, "1y");
  if (!series) return undefined;
  return annualizedVol(series.points.map((p) => p.c));
}

/** Simple YoY growth rate; undefined when either value is missing or the base is zero. */
export function yoyGrowth(cur: number | undefined, prev: number | undefined): number | undefined {
  if (cur === undefined || prev === undefined || prev === 0) return undefined;
  const g = (cur - prev) / Math.abs(prev);
  return Number.isFinite(g) ? g : undefined;
}

/**
 * ROIC = NOPAT / invested capital, from the latest income + balance sheet.
 * Invested capital = equity + debt − cash: idle cash isn't capital deployed in
 * operations, so leaving it in the denominator systematically understates ROIC
 * for cash-rich balance sheets (the AAPL/GOOG shape).
 */
export function roicFrom(p: {
  ebit?: number;
  incomeBeforeTax?: number;
  incomeTaxExpense?: number;
  equity?: number;
  debt?: number;
  cash?: number;
}): number | undefined {
  if (p.ebit === undefined || p.equity === undefined) return undefined;
  const invested = p.equity + (p.debt ?? 0) - (p.cash ?? 0);
  if (invested <= 0) return undefined;
  let taxRate = 0.21;
  if (p.incomeBeforeTax && p.incomeBeforeTax > 0 && p.incomeTaxExpense !== undefined)
    taxRate = Math.min(0.5, Math.max(0, p.incomeTaxExpense / p.incomeBeforeTax));
  const nopat = p.ebit * (1 - taxRate);
  const roic = nopat / invested;
  return Number.isFinite(roic) ? roic : undefined;
}

/**
 * Best-effort ROIC / FCF growth from Yahoo's per-period fundamentals time
 * series, newest annual period first. This replaces `quoteSummary`'s
 * `cashflowStatementHistory` / `incomeStatementHistory` / `balanceSheetHistory`
 * modules, which have returned almost no data since Nov 2024 (a known
 * upstream Yahoo API change — see the yahoo-finance2 deprecation notice).
 * `fundamentalsTimeSeries` is the library's current replacement and — unlike
 * those modules — still returns real statement data.
 */
async function deriveStatementMetrics(
  symbol: string
): Promise<{ roic?: number; fcfGrowth?: number; fcfTTM?: number }> {
  try {
    const raw = await yf.fundamentalsTimeSeries(symbol, {
      period1: new Date(Date.now() - 4 * 365 * 86_400_000),
      type: "annual",
      module: "all",
    });
    const rows = (raw as unknown as Record<string, unknown>[])
      .slice()
      .sort((a, b) => {
        const ad = a.date instanceof Date ? a.date.getTime() : 0;
        const bd = b.date instanceof Date ? b.date.getTime() : 0;
        return bd - ad; // newest first
      });

    const fcfGrowth = yoyGrowth(num(rows[0]?.freeCashFlow), num(rows[1]?.freeCashFlow));

    const latest = rows[0];
    const roic = roicFrom({
      ebit: num(latest?.EBIT) ?? num(latest?.operatingIncome),
      incomeBeforeTax: num(latest?.pretaxIncome),
      incomeTaxExpense: num(latest?.taxProvision),
      equity: num(latest?.stockholdersEquity),
      debt: num(latest?.totalDebt),
      cash:
        num(latest?.cashCashEquivalentsAndShortTermInvestments) ??
        num(latest?.cashAndCashEquivalents),
    });
    return { roic, fcfGrowth, fcfTTM: num(latest?.freeCashFlow) };
  } catch {
    return {};
  }
}

export async function fetchYahooPatch(
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
      // Yahoo reports D/E as a percentage (150.2 = 1.5×) — normalize to a ratio.
      debtToEquity: (() => {
        const de = num(fin?.debtToEquity);
        return de !== undefined && de >= 0 ? de / 100 : undefined;
      })(),
      // `trailingAnnualDividendYield` is always populated (0 for non-payers),
      // unlike `dividendYield`/`yield`, which Yahoo omits entirely rather than
      // reporting 0 when there's no active dividend — without this fallback a
      // non-payer's true (live) 0% reads as an unsourced "estimated" value.
      dividendYield:
        num(detail?.dividendYield) ??
        num(detail?.yield) ??
        num(detail?.trailingAnnualDividendYield),
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

  // Enrich, each independently guarded so a failure never voids the core patch:
  // realized volatility from price history, plus best-effort ROIC / FCF growth
  // from the statement time series.
  if (patch && !isFundType(patch)) {
    const [vol, stmt] = await Promise.all([
      fetchVolatility(symbol),
      deriveStatementMetrics(symbol),
    ]);
    if (vol !== undefined) patch.volatility = vol;
    if (stmt.roic !== undefined) patch.roic = stmt.roic;
    if (stmt.fcfGrowth !== undefined) patch.fcfGrowth = stmt.fcfGrowth;
    // `financialData.freeCashflow` (used above) is absent for some tickers;
    // fall back to the statement time series' latest annual FCF.
    if (patch.fcfYield === undefined && stmt.fcfTTM !== undefined && patch.marketCap) {
      patch.fcfYield = stmt.fcfTTM / patch.marketCap;
    }
  } else if (patch) {
    const vol = await fetchVolatility(symbol);
    if (vol !== undefined) patch.volatility = vol;
  }

  fundCache.set(symbol, { at: now, data: patch });
  return patch;
}

/** Funds/ETFs have no company statements to derive ROIC / FCF growth from. */
function isFundType(patch: FundamentalsPatch): boolean {
  return patch.sector === "Diversified" || patch.industry === "Fund / ETF";
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim().length > 0 ? v : undefined;

/**
 * Quote types worth surfacing in research — drop options/futures/FX noise.
 * Indices are excluded: their `^`-prefixed tickers don't survive symbol
 * sanitization, so they couldn't be re-fetched accurately.
 */
const SEARCHABLE_TYPES = new Set(["EQUITY", "ETF", "MUTUALFUND"]);

/**
 * Major US listing venues to keep in search results, by Yahoo exchange code:
 * Nasdaq (NMS/NGM/NCM), NYSE (NYQ), NYSE American / AMEX (ASE), NYSE Arca (PCX).
 * Everything else — OTC, foreign listings, pink sheets — is dropped so the
 * autocomplete stays on tickers the user can actually trade and re-fetch.
 */
const US_EXCHANGES = new Set(["NMS", "NGM", "NCM", "NYQ", "ASE", "PCX"]);

/**
 * Ticker / company search via Yahoo's suggest endpoint. Returns only tradable
 * securities the user would actually research, capped and de-noised.
 */
export async function searchSymbols(query: string): Promise<SymbolHit[]> {
  const term = query.trim();
  if (term.length === 0) return [];
  const key = term.toLowerCase();
  const now = Date.now();
  const hit = searchCache.get(key);
  if (hit && now - hit.at < SEARCH_TTL) return hit.data;

  let out: SymbolHit[] = [];
  try {
    const res = await yf.search(term, { quotesCount: 10, newsCount: 0 });
    const rows = (res.quotes ?? []) as Array<Record<string, unknown>>;
    out = rows
      .flatMap((r) => {
        if (r.isYahooFinance !== true) return [];
        const symbol = str(r.symbol);
        const type = str(r.quoteType) ?? "";
        if (!symbol || !SEARCHABLE_TYPES.has(type)) return [];
        // Keep only the major US venues (NASDAQ / NYSE / AMEX / Arca).
        const exch = str(r.exchange) ?? "";
        if (!US_EXCHANGES.has(exch)) return [];
        return [
          {
            symbol,
            name: str(r.longname) ?? str(r.shortname) ?? symbol,
            exchange: str(r.exchDisp) ?? str(r.exchange) ?? "",
            type: str(r.typeDisp) ?? type,
          },
        ];
      })
      .slice(0, 8);
  } catch {
    out = []; // provider drift — caller shows an empty result set
  }

  searchCache.set(key, { at: now, data: out });
  return out;
}

/**
 * Live-available aggregate fields for a benchmark, sourced from its tradable
 * ETF proxy (SPY for the S&P 500, QQQ for the NASDAQ-100). Yahoo publishes only
 * *valuation* ratios for a fund — P/E, cash-flow yield, dividend yield, sector
 * mix — never margins/ROIC/growth, so those stay assumptions (see
 * `lib/data/assumptions.ts`). All fields are optional; absent ones fall back to
 * the static benchmark profile.
 */
export interface BenchmarkLiveFields {
  forwardPE?: number;
  dividendYield?: number;
  fcfYield?: number;
  volatility?: number;
  return12m?: number;
  sectorWeights?: Partial<Record<Sector, number>>;
}

const benchmarkCache = new Map<string, { at: number; data: BenchmarkLiveFields }>();
const BENCHMARK_TTL = 6 * 3600_000;

/** Fetch the live-available benchmark aggregates from an ETF proxy. */
export async function fetchBenchmarkFields(
  symbol: string
): Promise<BenchmarkLiveFields> {
  const now = Date.now();
  const hit = benchmarkCache.get(symbol);
  if (hit && now - hit.at < BENCHMARK_TTL) return hit.data;

  const out: BenchmarkLiveFields = {};
  const [summary, series] = await Promise.allSettled([
    yf.quoteSummary(symbol, { modules: ["topHoldings", "summaryDetail"] }),
    fetchHistory(symbol, "1y"),
  ]);

  if (summary.status === "fulfilled") {
    const s = summary.value;
    const eh = s.topHoldings?.equityHoldings as
      | Record<string, unknown>
      | undefined;
    // equityHoldings stores *yields* (earnings/price, cashflow/price), not ratios.
    const earnYield = num(eh?.priceToEarnings);
    if (earnYield && earnYield > 0) out.forwardPE = 1 / earnYield;
    const cfYield = num(eh?.priceToCashflow);
    if (cfYield && cfYield > 0) out.fcfYield = cfYield;

    const divYield = num(s.summaryDetail?.yield);
    if (divYield && divYield > 0) out.dividendYield = divYield;

    if (s.topHoldings?.sectorWeightings) {
      const weights: Partial<Record<Sector, number>> = {};
      for (const entry of s.topHoldings.sectorWeightings) {
        for (const [key, w] of Object.entries(entry)) {
          const sector = ETF_SECTOR[key];
          const weight = num(w);
          if (sector && weight && weight > 0.001) weights[sector] = weight;
        }
      }
      if (Object.keys(weights).length > 0) out.sectorWeights = weights;
    }
  }

  if (series.status === "fulfilled" && series.value) {
    const closes = series.value.points.map((p) => p.c);
    const vol = annualizedVol(closes);
    if (vol !== undefined) out.volatility = vol;
    if (closes.length >= 2 && closes[0] > 0) {
      const r = closes[closes.length - 1] / closes[0] - 1;
      if (Number.isFinite(r)) out.return12m = r;
    }
  }

  benchmarkCache.set(symbol, { at: now, data: out });
  return out;
}

/** Lookback window + bar interval per range. */
const RANGE_CFG: Record<HistoryRange, { days: number; interval: "1d" | "1wk" }> = {
  "1m": { days: 34, interval: "1d" },
  "6m": { days: 190, interval: "1d" },
  "1y": { days: 372, interval: "1d" },
  "5y": { days: Math.round(5 * 365.25) + 7, interval: "1wk" },
};

/**
 * Adjusted-close price history for one symbol over a range. Mirrors the
 * regime engine's bar hygiene: null/holiday rows are dropped. Null when the
 * provider has no usable series (caller degrades gracefully).
 */
export async function fetchHistory(
  symbol: string,
  range: HistoryRange
): Promise<HistorySeries | null> {
  const cacheKey = `${symbol}:${range}`;
  const now = Date.now();
  const hit = historyCache.get(cacheKey);
  if (hit && now - hit.at < HISTORY_TTL) return hit.data;

  let series: HistorySeries | null = null;
  try {
    const cfg = RANGE_CFG[range];
    const result = await yf.chart(symbol, {
      period1: new Date(now - cfg.days * 86_400_000),
      interval: cfg.interval,
    });
    const points = [];
    for (const q of result.quotes) {
      const close = num(q.adjclose) ?? num(q.close);
      if (close === undefined || close <= 0) continue;
      points.push({ t: q.date.toISOString(), c: close });
    }
    if (points.length >= 2) {
      series = {
        symbol,
        range,
        currency: str(result.meta?.currency) ?? "USD",
        points,
      };
    }
  } catch {
    series = null;
  }

  historyCache.set(cacheKey, { at: now, data: series });
  return series;
}
