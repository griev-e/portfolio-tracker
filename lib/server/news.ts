import { yf } from "@/lib/server/yahoo";
import type { NewsItem } from "@/lib/intelligence/types";

/**
 * Per-holding news via Yahoo's search endpoint (no batch variant exists, so
 * misses fan out per symbol with bounded concurrency, like /api/fundamentals).
 */
const newsCache = new Map<string, { at: number; data: NewsItem[] }>();
const NEWS_TTL = 10 * 60_000;
const MAX_ITEMS = 60;

function toIso(v: unknown): string | null {
  // Schema says Date, but tolerate epoch seconds/millis if the provider drifts.
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

async function fetchSymbolNews(symbol: string): Promise<NewsItem[]> {
  const now = Date.now();
  const hit = newsCache.get(symbol);
  if (hit && now - hit.at < NEWS_TTL) return hit.data;

  let items: NewsItem[] = [];
  try {
    const result = await yf.search(symbol, { newsCount: 8, quotesCount: 0 });
    items = (result.news ?? []).flatMap((n) => {
      const publishedAt = toIso(n.providerPublishTime);
      if (!n.uuid || !n.title || !n.link || !publishedAt) return [];
      return [
        {
          id: n.uuid,
          symbol,
          title: n.title,
          publisher: n.publisher ?? "",
          link: n.link,
          publishedAt,
          relatedTickers: n.relatedTickers ?? [],
        },
      ];
    });
  } catch {
    items = []; // symbol unknown to Yahoo, or API drift — story just omitted
  }

  newsCache.set(symbol, { at: now, data: items });
  return items;
}

export async function fetchNews(symbols: string[]): Promise<NewsItem[]> {
  const portfolio = new Set(symbols);
  const all: NewsItem[] = [];
  const CONCURRENCY = 4;
  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const chunk = symbols.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(fetchSymbolNews));
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value);
    }
  }

  // The same story often surfaces under several holdings' searches. Collapse on
  // the stable UUID, tracking every search bucket it appeared under (`buckets`)
  // and the union of Yahoo's own `relatedTickers` (the reliable signal of what
  // the story is actually about — the search bucket is fuzzy and routinely
  // surfaces general market/political stories under unrelated tickers).
  type Agg = { item: NewsItem; buckets: Set<string>; related: Set<string> };
  const byId = new Map<string, Agg>();
  for (const item of all) {
    let agg = byId.get(item.id);
    if (!agg) {
      agg = { item, buckets: new Set(), related: new Set() };
      byId.set(item.id, agg);
    }
    agg.buckets.add(item.symbol);
    for (const t of item.relatedTickers) agg.related.add(t);
  }

  const out: NewsItem[] = [];
  for (const { item, buckets, related } of byId.values()) {
    // A search bucket is "confirmed" when Yahoo also tags the story with that
    // ticker — the strongest evidence the story is genuinely about that holding.
    const confirmed = [...buckets].filter((b) => related.has(b));
    const relatedInPortfolio = [...related].filter((t) => portfolio.has(t));

    // Drop incidental noise: when Yahoo says the story is about *other* tickers
    // (relatedTickers present) yet none of them — and no search bucket — line up
    // with the portfolio, it merely mentioned our holding in passing. An empty
    // relatedTickers gives no evidence either way, so we keep it.
    if (
      confirmed.length === 0 &&
      relatedInPortfolio.length === 0 &&
      related.size > 0
    ) {
      continue;
    }

    // Tag the story with the holding it's genuinely about, not the arbitrary
    // first search bucket: a Yahoo-confirmed ticker wins, then any portfolio
    // ticker Yahoo names, falling back to the search bucket.
    const symbol =
      confirmed[0] ?? relatedInPortfolio[0] ?? [...buckets][0] ?? item.symbol;

    // Carry every holding the story touches so chip filtering catches it under
    // any of them.
    const relatedTickers = [...new Set([...related, ...buckets])];

    out.push({ ...item, symbol, relatedTickers });
  }

  return out
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, MAX_ITEMS);
}
