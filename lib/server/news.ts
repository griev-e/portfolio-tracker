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
  const all: NewsItem[] = [];
  const CONCURRENCY = 4;
  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const chunk = symbols.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(fetchSymbolNews));
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value);
    }
  }

  // The same story often appears under several holdings — keep the first
  // occurrence and union the tickers so the UI can filter either way.
  const byId = new Map<string, NewsItem>();
  for (const item of all) {
    const seen = byId.get(item.id);
    if (!seen) {
      byId.set(item.id, item);
    } else {
      seen.relatedTickers = [
        ...new Set([...seen.relatedTickers, item.symbol, ...item.relatedTickers]),
      ];
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, MAX_ITEMS);
}
