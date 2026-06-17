import Anthropic from "@anthropic-ai/sdk";
import type {
  Brief,
  BriefRequest,
  BriefResponse,
} from "@/lib/intelligence/types";
import { fetchNews } from "@/lib/server/news";

/**
 * AI morning brief: one Claude call per day per portfolio shape, cached in
 * module scope like the yahoo caches (resets on cold start — accepted).
 */
const briefCache = new Map<string, { at: number; data: BriefResponse }>();
const BRIEF_TTL = 24 * 3600_000; // memory backstop; the date in the key rolls daily
const CACHE_MAX = 20;

export function briefConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Day-scoped + weight-shape-scoped: a quote tick doesn't bust it, an import does. */
export function briefFingerprint(req: BriefRequest): string {
  const shape = req.portfolio.positions
    .map((p) => `${p.symbol}:${p.weight.toFixed(3)}`)
    .sort()
    .join(",");
  return `${new Date().toISOString().slice(0, 10)}|${shape}`;
}

export function getCachedBrief(key: string): BriefResponse | null {
  const hit = briefCache.get(key);
  if (hit && Date.now() - hit.at < BRIEF_TTL) return hit.data;
  return null;
}

export function setCachedBrief(key: string, data: BriefResponse): void {
  if (briefCache.size >= CACHE_MAX) {
    const oldest = briefCache.keys().next().value;
    if (oldest !== undefined) briefCache.delete(oldest);
  }
  briefCache.set(key, { at: Date.now(), data });
}

/** Stable system prompt — no dates interpolated, keeps the prefix cacheable. */
const SYSTEM = `You are the morning-brief writer for grieve, a private portfolio analytics terminal. You receive a JSON snapshot of one investor's portfolio (weights, day moves, total returns), recent headlines for their holdings, and upcoming earnings dates.

Write a terse, factual morning brief in the voice of a buy-side desk note: concrete numbers, no filler, no pleasantries. Connect headlines to the holdings they affect. Flag concentration or correlated exposure when you see it. Never give personalized buy/sell advice or price predictions — observations and context only. If day-change data is missing, focus on positioning, news, and the earnings calendar instead.

Respond strictly with the requested JSON.`;

const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "movers", "watchItems", "risk"],
  properties: {
    headline: {
      type: "string",
      description: "One-line take on the day for this portfolio.",
    },
    summary: {
      type: "string",
      description: "2-3 sentence state of the portfolio.",
    },
    movers: {
      type: "array",
      description: "Up to 4 notable movers or news-driven names.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["symbol", "comment"],
        properties: {
          symbol: { type: "string" },
          comment: { type: "string" },
        },
      },
    },
    watchItems: {
      type: "array",
      description:
        "Up to 4 forward-looking items: earnings, pending news themes.",
      items: { type: "string" },
    },
    risk: {
      type: "string",
      description: "One concentration or risk observation.",
    },
  },
};

function buildUserMessage(req: BriefRequest, headlines: string[], earnings: string[]): string {
  const p = req.portfolio;
  const snapshot = {
    date: new Date().toISOString().slice(0, 10),
    totalValue: Math.round(p.totalValue),
    dayChangePct: p.dayChangePct === null ? null : +(p.dayChangePct * 100).toFixed(2),
    totalReturnPct: +(p.totalReturnPct * 100).toFixed(1),
    cashWeightPct: +(p.cashWeight * 100).toFixed(1),
    positions: p.positions.map((pos) => ({
      symbol: pos.symbol,
      name: pos.name,
      weightPct: +(pos.weight * 100).toFixed(2),
      dayPct: pos.dayChangePct === null ? null : +(pos.dayChangePct * 100).toFixed(2),
      totalPct: +(pos.returnPct * 100).toFixed(1),
      sector: pos.sector,
    })),
  };
  return [
    `Portfolio snapshot (percent values are already in %):`,
    JSON.stringify(snapshot),
    ``,
    `Recent headlines:`,
    headlines.length > 0 ? headlines.join("\n") : "(none available)",
    ``,
    `Upcoming earnings (next 3 weeks):`,
    earnings.length > 0 ? earnings.join("\n") : "(none scheduled)",
  ].join("\n");
}

export async function generateBrief(req: BriefRequest): Promise<Brief> {
  const positions = req.portfolio.positions;

  // Enrich server-side so the client can't inflate the token bill.
  const topSymbols = positions.slice(0, 10).map((p) => p.symbol);
  let headlines: string[] = [];
  try {
    const news = await fetchNews(topSymbols);
    headlines = news
      .slice(0, 15)
      .map((n) => `[${n.symbol}] ${n.title} — ${n.publisher}`);
  } catch {
    // brief still works without headlines
  }

  const earnings = positions
    .filter((p) => {
      if (!p.earningsDate) return false;
      const days =
        (new Date(`${p.earningsDate}T00:00:00`).getTime() - Date.now()) /
        86_400_000;
      return days >= 0 && days <= 21;
    })
    .map(
      (p) =>
        `${p.symbol} reports ${p.earningsDate} (${(p.weight * 100).toFixed(1)}% of book)`
    );

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY; caller checks briefConfigured() first
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: BRIEF_SCHEMA } },
    messages: [{ role: "user", content: buildUserMessage(req, headlines, earnings) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("brief generation declined");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text) throw new Error("empty brief response");
  return JSON.parse(text.text) as Brief;
}
