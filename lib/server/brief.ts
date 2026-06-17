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
const SYSTEM = `You are the morning-brief writer for grieve, a private portfolio analytics terminal. You receive a JSON snapshot of one investor's portfolio (weights, day moves, total returns, sectors), recent headlines for their holdings, and upcoming earnings dates.

Write a substantive, factual morning brief in the voice of a buy-side desk note: concrete numbers, sharp reasoning, no filler, no pleasantries. Each section earns its place — make the reader smarter about their own book.

- headline: one crisp line capturing the day's character for this portfolio.
- summary: 3–4 sentences on the state of the book — what moved it, the net day/total figures, and what the tape is saying.
- positioning: a short paragraph on how the book is actually posed — sector tilts, single-name concentration, cash level, and what those choices express. Name the heaviest exposures with their weights.
- movers: up to 5 names that actually mattered today (or are news-driven), each with a specific, numeric comment tying the move to a cause where the headlines support it.
- themes: up to 3 cross-cutting threads that connect multiple holdings — a shared macro driver (rates, AI capex, the dollar), a sector running together, or a correlated cluster. Each has a short title and a 1–2 sentence detail. Skip if nothing genuine connects the names.
- watchItems: up to 5 concrete forward-looking items — upcoming earnings with the weight at stake, data releases, or pending catalysts.
- risk: the single sharpest concentration or correlated-exposure observation, quantified.

Connect headlines to the holdings they affect. Never give personalized buy/sell advice or price predictions — observations and context only. If day-change data is missing, lean on positioning, news, and the earnings calendar. Do not invent numbers that aren't in the data.

Respond strictly with the requested JSON.`;

const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "positioning", "movers", "themes", "watchItems", "risk"],
  properties: {
    headline: {
      type: "string",
      description: "One-line take on the day for this portfolio.",
    },
    summary: {
      type: "string",
      description: "3-4 sentence state of the portfolio with the key numbers.",
    },
    positioning: {
      type: "string",
      description:
        "A short paragraph on how the book is posed: sector tilts, single-name concentration, and cash, naming the heaviest exposures with weights.",
    },
    movers: {
      type: "array",
      description: "Up to 5 notable movers or news-driven names.",
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
    themes: {
      type: "array",
      description:
        "Up to 3 cross-holding threads (shared macro driver, sector running together, correlated cluster). Empty if none genuinely connect the names.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
    watchItems: {
      type: "array",
      description:
        "Up to 5 forward-looking items: earnings with weight at stake, data releases, pending catalysts.",
      items: { type: "string" },
    },
    risk: {
      type: "string",
      description: "One quantified concentration or correlated-exposure observation.",
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
