import Anthropic from "@anthropic-ai/sdk";
import type {
  Brief,
  BriefRequest,
  BriefResponse,
} from "@/lib/intelligence/types";
import { fetchNews } from "@/lib/server/news";
import { usdCost } from "@/lib/server/cost";

/**
 * AI morning brief: one Claude call per day per portfolio shape, cached in
 * module scope like the yahoo caches (resets on cold start — accepted).
 */
const briefCache = new Map<string, { at: number; data: BriefResponse }>();
const BRIEF_TTL = 24 * 3600_000; // memory backstop; the date in the key rolls daily
const CACHE_MAX = 20;

/**
 * Haiku 4.5 — the brief is a constrained, structured task (the JSON schema does
 * the heavy lifting), so the fastest, cheapest current model is the right tool.
 * ~5× cheaper input/output than Opus and quick enough to keep the page snappy.
 */
export const BRIEF_MODEL = "claude-haiku-4-5";

/**
 * Cost backstop: cap how many *generations* (cache misses that actually hit the
 * API) one warm instance will do per hour. The day+shape cache already dedupes
 * normal use; this bounds the bill if someone churns portfolio shapes to force
 * regeneration. Resets on cold start — accepted, like the caches above.
 */
const GEN_WINDOW_MS = 3600_000;
const GEN_MAX = 40;
let genWindowStart = Date.now();
let genCount = 0;

export function briefRateLimited(): boolean {
  const now = Date.now();
  if (now - genWindowStart > GEN_WINDOW_MS) {
    genWindowStart = now;
    genCount = 0;
  }
  return genCount >= GEN_MAX;
}

export function briefConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Map a provider error to an HTTP outcome. Lives here so the route never has to
 * import the Anthropic SDK (it stays confined to lib/server/*).
 */
export function briefErrorResponse(err: unknown): { status: number; error: string } {
  // A key that fails auth behaves like no key at all.
  if (err instanceof Anthropic.AuthenticationError)
    return { status: 501, error: "brief not configured" };
  if (err instanceof Anthropic.RateLimitError)
    return { status: 429, error: "brief provider rate limited" };
  return { status: 502, error: "brief provider unavailable" };
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

/** Stable system prompt — no per-request interpolation, so it's byte-identical
 *  across calls. (No `cache_control` is set: the per-day-per-shape module cache
 *  already dedupes the only repetition, and this prompt sits below Haiku 4.5's
 *  minimum cacheable-prefix size, so a breakpoint would silently no-op.) */
const SYSTEM = `You are the morning-brief writer for alpha, a private portfolio analytics terminal. You receive a JSON snapshot of one investor's portfolio (weights, day moves, total returns, sectors), recent headlines for their holdings, and upcoming earnings dates.

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

export async function generateBrief(
  req: BriefRequest
): Promise<{ brief: Brief; costUSD: number | null }> {
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

  // reads ANTHROPIC_API_KEY; caller checks briefConfigured() first. A bounded
  // timeout means a slow provider fails fast instead of holding the lambda open
  // for the full maxDuration.
  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
  genCount += 1;
  const response = await client.messages.create({
    model: BRIEF_MODEL,
    max_tokens: 1500,
    // The JSON schema constrains the output; thinking would only add tokens,
    // latency, and cost for no quality gain on a structured desk note.
    thinking: { type: "disabled" },
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: BRIEF_SCHEMA } },
    messages: [{ role: "user", content: buildUserMessage(req, headlines, earnings) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("brief generation declined");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text) throw new Error("empty brief response");
  return {
    brief: JSON.parse(text.text) as Brief,
    costUSD: usdCost(BRIEF_MODEL, response.usage),
  };
}
