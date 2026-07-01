import Anthropic from "@anthropic-ai/sdk";
import { AiCache, GenLimiter, mapAnthropicError } from "@/lib/server/aiEndpoint";
import { usdCost } from "@/lib/server/cost";
import {
  DISCOVER_MODE_IDS,
  type DiscoverModeId,
  type DiscoverPlan,
  type DiscoverRequest,
  type DiscoverResponse,
} from "@/lib/discover/types";

/**
 * AI Discover: given a portfolio snapshot and a research "mode", Claude proposes
 * new names to add that fit both the directive and this specific book. Like the
 * allocator, selecting securities for a particular portfolio is a genuine
 * reasoning task — concentration, factor tilts, valuation, risk balance — so it
 * runs with adaptive thinking at high effort for the deepest reasoning pass.
 * One generation per day per (mode + portfolio shape), cached in module scope.
 */
const PLAN_TTL = 24 * 3600_000;
const planCache = new AiCache<DiscoverResponse>(PLAN_TTL, 40);

export const DISCOVER_MODEL = "claude-sonnet-4-6";
export const DISCOVER_EFFORT = "high" as const;

const genLimiter = new GenLimiter(3600_000, 25);

export const discoverRateLimited = (): boolean => genLimiter.limited();

export function discoverConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export const discoverErrorResponse = (err: unknown) =>
  mapAnthropicError(err, {
    notConfigured: "discover not configured",
    rateLimited: "discover rate limited",
    timedOut: "discover timed out — try again",
    unavailable: "discover unavailable",
  });

/** Day + mode + weight-shape scoped: a quote tick doesn't bust it, an import does. */
export function discoverFingerprint(req: DiscoverRequest): string {
  const shape = req.portfolio.positions
    .map((p) => `${p.symbol}:${p.weight.toFixed(3)}`)
    .sort()
    .join(",");
  return `${new Date().toISOString().slice(0, 10)}|${req.mode}|${shape}`;
}

export const getCachedDiscover = (key: string): DiscoverResponse | null =>
  planCache.get(key);
export const setCachedDiscover = (key: string, data: DiscoverResponse): void =>
  planCache.set(key, data);

/** Stable system prompt — no per-request interpolation, so it's byte-identical
 *  across calls. (No `cache_control` is set: the per-day-per-shape module cache
 *  already dedupes the only repetition that exists.) */
const SYSTEM = `You are the equity-research desk for alpha, a private portfolio analytics terminal. You receive a JSON snapshot of one investor's book — per-holding weights, sector, valuation (forward P/E, dividend yield), quality (ROIC, revenue growth), risk (beta, volatility) — plus book-level metrics (expected return, volatility, Sharpe, beta, effective holdings) and a research directive describing the KIND of ideas to surface.

Your job: propose NEW securities to ADD to this book — tickers the investor does NOT already own — that both (a) satisfy the directive and (b) genuinely complement THIS portfolio: filling its gaps, balancing its risks, or deepening a strength where that is the point.

Rules of engagement:
- Never suggest a ticker already in the snapshot's holdings. Surface 4-6 ideas, highest conviction first.
- Use real, currently US-listed securities (stocks or ETFs) with correct tickers. Never invent symbols.
- Tie every idea to specifics of THIS book — a sector it lacks, a concentration to offset, a factor tilt, an income gap, a risk to hedge — not generic blurbs.
- "thesis" is the standalone case for the name. "fit" must explain how it interacts with the existing holdings (what it adds or hedges relative to what's owned). "risk" is the single sharpest risk.
- "metrics" are 2-4 compact, decision-relevant figures you are reasonably confident about (e.g. forward P/E, revenue growth, dividend yield, beta), written as short strings and understood to be approximate. Omit a metric rather than guess wildly — never fabricate precision.
- "gaps" name the structural holes in the current book that this directive addresses.

These are model-generated research ideas on a best-effort basis — not personalized investment advice, not price predictions, and the figures are approximate. Be concrete, specific to this portfolio, and honest about risk.

Respond strictly with the requested JSON.`;

const MODE_DIRECTIVE: Record<DiscoverModeId, string> = {
  diversify:
    "DIRECTIVE — Diversify: surface names that most reduce this book's concentration and add the exposures it lacks (under-owned sectors, factors, geographies, or low-correlation return streams). Prioritize what would raise effective holdings and steady the portfolio, not more of what it already leans on.",
  growth:
    "DIRECTIVE — High Growth: surface high-quality secular growth compounders (strong revenue/earnings growth with durable tailwinds) that extend or complement the book's growth engine without simply doubling an existing position's exposure.",
  value:
    "DIRECTIVE — Value & Income: surface attractively valued, cash-generative names — low/reasonable multiples, high free-cash-flow or dividend yield, quality at a fair price — that add value and income the current book is light on.",
  defensive:
    "DIRECTIVE — Defensive Hedge: surface lower-beta, defensive or counter-cyclical names (staples, healthcare, utilities, quality balance sheets, or explicit hedges) that would reduce the book's volatility and drawdown given its current risk profile.",
  quality:
    "DIRECTIVE — Quality Moats: surface wide-moat, high-ROIC, durable franchises with pricing power and consistent capital returns that raise the overall quality of the book.",
  thematic:
    "DIRECTIVE — Megatrends: surface thematic exposure to major secular trends (e.g. AI infrastructure, energy transition, automation, biotech, defense) that the current book does not yet capture. Higher risk is acceptable; be explicit about it.",
};

function buildUserMessage(req: DiscoverRequest): string {
  const p = req.portfolio;
  const snapshot = {
    totalValue: Math.round(p.totalValue),
    cashWeightPct: +p.cashWeightPct.toFixed(1),
    book: {
      expectedReturnPct: +p.metrics.expectedReturnPct.toFixed(1),
      volatilityPct: +p.metrics.volatilityPct.toFixed(1),
      sharpe: +p.metrics.sharpe.toFixed(2),
      beta: +p.metrics.beta.toFixed(2),
      effectiveHoldings: +p.metrics.effectiveHoldings.toFixed(1),
    },
    holdings: p.positions.map((pos) => ({
      symbol: pos.symbol,
      name: pos.name,
      weightPct: +(pos.weight * 100).toFixed(2),
      sector: pos.sector,
      forwardPE: pos.forwardPE,
      dividendYieldPct:
        pos.dividendYield === null ? null : +(pos.dividendYield * 100).toFixed(2),
      roicPct: pos.roic === null ? null : +(pos.roic * 100).toFixed(1),
      revenueGrowthPct:
        pos.revenueGrowth === null ? null : +(pos.revenueGrowth * 100).toFixed(1),
      beta: pos.beta,
      volPct: pos.volatility === null ? null : +(pos.volatility * 100).toFixed(0),
    })),
  };
  return [
    MODE_DIRECTIVE[req.mode],
    ``,
    `Portfolio snapshot (percent values are already in %):`,
    JSON.stringify(snapshot),
    ``,
    `Propose 4-6 new ideas that fit the directive and complement this specific book. Return the research as JSON.`,
  ].join("\n");
}

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["read", "ideas", "gaps"],
  properties: {
    read: {
      type: "string",
      description: "Overall read tying the directive to this specific book.",
    },
    ideas: {
      type: "array",
      description: "New names to add, highest conviction first. 4-6 items.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["symbol", "name", "sector", "conviction", "thesis", "fit", "metrics", "risk"],
        properties: {
          symbol: { type: "string", description: "Ticker — must NOT be an owned holding." },
          name: { type: "string", description: "Company / fund name." },
          sector: { type: "string", description: "GICS-style sector." },
          conviction: { type: "string", enum: ["high", "medium", "low"] },
          thesis: { type: "string", description: "Standalone case for the name." },
          fit: {
            type: "string",
            description: "How it complements or hedges the existing holdings.",
          },
          metrics: {
            type: "array",
            description: "2-4 compact approximate figures.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "value"],
              properties: {
                label: { type: "string", description: "e.g. 'Fwd P/E', 'Rev growth', 'Div yield'." },
                value: { type: "string", description: "e.g. '~22×', '~18%', '2.1%'." },
              },
            },
          },
          risk: { type: "string", description: "Single sharpest risk." },
        },
      },
    },
    gaps: {
      type: "array",
      description: "Structural holes in the current book this directive addresses.",
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
  },
};

// Hard wall-clock deadline fired by an AbortController on elapsed time (the
// SDK's `timeout` is an idle timeout that resets on every streamed chunk, so
// adaptive thinking never trips it). 55s fires inside the route's 60s
// maxDuration, turning a slow tail into a catchable abort instead of a bare 504.
const DEADLINE_MS = 55_000;

export async function generateDiscover(
  req: DiscoverRequest
): Promise<{ plan: DiscoverPlan; costUSD: number | null }> {
  // reads ANTHROPIC_API_KEY; caller checks discoverConfigured() first. Stream +
  // finalMessage keeps the connection warm while the model thinks. No retry
  // budget: a retry on a near-deadline request would blow the ceiling anyway.
  const client = new Anthropic({ timeout: 55_000, maxRetries: 0 });
  genLimiter.record();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), DEADLINE_MS);
  try {
    const stream = client.messages.stream(
      {
        model: DISCOVER_MODEL,
        max_tokens: 6000,
        thinking: { type: "adaptive" },
        system: SYSTEM,
        output_config: {
          format: { type: "json_schema", schema: PLAN_SCHEMA },
          effort: DISCOVER_EFFORT,
        },
        messages: [{ role: "user", content: buildUserMessage(req) }],
      },
      { signal: controller.signal }
    );

    const response = await stream.finalMessage();
    if (response.stop_reason === "refusal") {
      throw new Error("discover generation declined");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("discover truncated: hit max_tokens before completing");
    }
    for (const block of response.content) {
      if (block.type === "text") {
        return {
          plan: JSON.parse(block.text) as DiscoverPlan,
          costUSD: usdCost(DISCOVER_MODEL, response.usage),
        };
      }
    }
    throw new Error("empty discover response");
  } finally {
    clearTimeout(deadline);
  }
}

export function isDiscoverMode(v: unknown): v is DiscoverModeId {
  return typeof v === "string" && (DISCOVER_MODE_IDS as string[]).includes(v);
}
