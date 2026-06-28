import Anthropic from "@anthropic-ai/sdk";
import type {
  AllocationPlan,
  AllocationResponse,
  AllocatorRequest,
} from "@/lib/allocator/types";
import { usdCost } from "@/lib/server/cost";

/**
 * AI dry-powder allocator: given a portfolio snapshot and the cash available to
 * deploy, Claude proposes how to put that capital to work across the holdings.
 * One generation per day per portfolio shape, cached in module scope like the
 * yahoo/brief caches (resets on cold start — accepted).
 */
const planCache = new Map<string, { at: number; data: AllocationResponse }>();
const PLAN_TTL = 24 * 3600_000; // memory backstop; the date in the key rolls daily
const CACHE_MAX = 20;

/**
 * Sonnet 4.6 with adaptive thinking. Unlike the morning brief — a constrained
 * summarization the cheapest model handles well — capital allocation is a
 * genuine reasoning task: weighing concentration, valuation, quality, momentum
 * and diversification against one another to decide where an incremental dollar
 * does the most good. Adaptive thinking lets it reason before committing to a
 * split, with effort kept at `high` for the deepest reasoning pass the
 * serverless time budget allows, since the json_schema does the structural
 * heavy lifting.
 */
export const ALLOCATOR_MODEL = "claude-sonnet-4-6";
export const ALLOCATOR_EFFORT = "high" as const;

/**
 * Cost backstop: cap fresh generations (cache misses that hit the API) per warm
 * instance per hour. Sonnet is pricier than the brief's Haiku, so this is tighter.
 * Resets on cold start — accepted, like the caches above.
 */
const GEN_WINDOW_MS = 3600_000;
const GEN_MAX = 20;
let genWindowStart = Date.now();
let genCount = 0;

export function allocatorRateLimited(): boolean {
  const now = Date.now();
  if (now - genWindowStart > GEN_WINDOW_MS) {
    genWindowStart = now;
    genCount = 0;
  }
  return genCount >= GEN_MAX;
}

export function allocatorConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Map a provider error to an HTTP outcome. Lives here so the route never has to
 * import the Anthropic SDK (it stays confined to lib/server/*).
 */
export function allocatorErrorResponse(err: unknown): { status: number; error: string } {
  // A key that fails auth behaves like no key at all.
  if (err instanceof Anthropic.AuthenticationError)
    return { status: 501, error: "allocator not configured" };
  if (err instanceof Anthropic.RateLimitError)
    return { status: 429, error: "allocator rate limited" };
  if (
    err instanceof Anthropic.APIConnectionTimeoutError ||
    err instanceof Anthropic.APIUserAbortError
  )
    return { status: 504, error: "allocation timed out — try again" };
  return { status: 502, error: "allocator unavailable" };
}

/** Day + weight-shape scoped: a quote tick doesn't bust it, an import does. */
export function allocatorFingerprint(req: AllocatorRequest): string {
  const shape = req.portfolio.positions
    .map((p) => `${p.symbol}:${p.weight.toFixed(3)}`)
    .sort()
    .join(",");
  return `${new Date().toISOString().slice(0, 10)}|${shape}`;
}

export function getCachedPlan(key: string): AllocationResponse | null {
  const hit = planCache.get(key);
  if (hit && Date.now() - hit.at < PLAN_TTL) return hit.data;
  return null;
}

export function setCachedPlan(key: string, data: AllocationResponse): void {
  if (planCache.size >= CACHE_MAX) {
    const oldest = planCache.keys().next().value;
    if (oldest !== undefined) planCache.delete(oldest);
  }
  planCache.set(key, { at: Date.now(), data });
}

/** Stable system prompt — no per-request interpolation, so it's byte-identical
 *  across calls. (No `cache_control` is set: the per-day-per-shape module cache
 *  already dedupes the only repetition that exists.) */
const SYSTEM = `You are the capital-allocation desk for alpha, a private portfolio analytics terminal. You receive a JSON snapshot of one investor's book — per-holding weights, sector, valuation (forward P/E, FCF yield, dividend yield), quality (ROIC, revenue growth), risk (beta, volatility), analyst rating and upside — plus the dollars of dry powder available to deploy.

Your job: decide how to put that dry powder to work across the holdings the investor already owns. Think like a buy-side PM sizing additions — reason about where an incremental dollar does the most good for this specific book, weighing concentration, valuation, quality, momentum, and diversification against one another.

Rules of engagement:
- Only allocate to symbols present in the snapshot. Never invent tickers.
- The allocationPct values across "deployments", plus "reservePct", MUST sum to 100. Each allocationPct is the share of the dry powder routed to that name.
- Concentrate conviction: a handful of well-reasoned additions beats spreading thin. Use at most 8 deployments. Keeping a meaningful reserve is a legitimate call when nothing is compelling or the book is already stretched.
- Tie every rationale to specifics in the data — a valuation, a quality metric, an underweight, a drawdown worth averaging into. No filler, no boilerplate.
- Use "trims" for names that are richly valued, overweight, or where adding would worsen concentration — flag them instead of topping them up.
- Use "considerations" for genuine structural gaps the owned names can't fill (e.g. no defensive or healthcare exposure, single-sector concentration, no income) — qualitative threads, not tradeable line items.
- "risk" is the single sharpest risk in the deployment you propose, quantified where the data allows.

This is allocation analysis on a model basis — not personalized investment advice and not a price prediction. Be concrete and honest about the tradeoffs. Do not invent numbers absent from the data.

Respond strictly with the requested JSON.`;

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["thesis", "deployments", "reservePct", "trims", "considerations", "risk"],
  properties: {
    thesis: {
      type: "string",
      description: "Overall read on how to deploy the dry powder for this book.",
    },
    deployments: {
      type: "array",
      description: "Owned names to add to, highest conviction first. At most 8.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["symbol", "allocationPct", "conviction", "rationale"],
        properties: {
          symbol: { type: "string", description: "Ticker, must be one of the snapshot symbols." },
          allocationPct: {
            type: "number",
            description: "Share of dry powder routed here, 0-100.",
          },
          conviction: { type: "string", enum: ["high", "medium", "low"] },
          rationale: {
            type: "string",
            description: "Why this name, tied to specifics in the data.",
          },
        },
      },
    },
    reservePct: {
      type: "number",
      description:
        "Share of dry powder to keep as reserve, 0-100. deployments + reserve sum to 100.",
    },
    trims: {
      type: "array",
      description: "Names to trim or avoid topping up.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["symbol", "note"],
        properties: {
          symbol: { type: "string" },
          note: { type: "string" },
        },
      },
    },
    considerations: {
      type: "array",
      description: "Structural gaps / diversification threads the owned names can't fill.",
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
    risk: {
      type: "string",
      description: "Single sharpest risk in the proposed deployment, quantified.",
    },
  },
};

function buildUserMessage(req: AllocatorRequest): string {
  const p = req.portfolio;
  const snapshot = {
    deployableCash: Math.round(p.deployable),
    idleCash: Math.round(p.cash),
    cashWeightPct: +(p.cashWeight * 100).toFixed(1),
    totalValue: Math.round(p.totalValue),
    investedValue: Math.round(p.equityValue),
    totalReturnPct: +(p.totalReturnPct * 100).toFixed(1),
    positions: p.positions.map((pos) => ({
      symbol: pos.symbol,
      name: pos.name,
      weightPct: +(pos.weight * 100).toFixed(2),
      sector: pos.sector,
      totalReturnPct: +(pos.returnPct * 100).toFixed(1),
      dayPct: pos.dayChangePct === null ? null : +(pos.dayChangePct * 100).toFixed(2),
      forwardPE: pos.forwardPE,
      fcfYieldPct: pos.fcfYield === null ? null : +(pos.fcfYield * 100).toFixed(1),
      dividendYieldPct:
        pos.dividendYield === null ? null : +(pos.dividendYield * 100).toFixed(2),
      roicPct: pos.roic === null ? null : +(pos.roic * 100).toFixed(1),
      revenueGrowthPct:
        pos.revenueGrowth === null ? null : +(pos.revenueGrowth * 100).toFixed(1),
      beta: pos.beta,
      volPct: pos.volatility === null ? null : +(pos.volatility * 100).toFixed(0),
      analystRating: pos.analystRating,
      analystUpsidePct:
        pos.analystUpside === null ? null : +(pos.analystUpside * 100).toFixed(0),
    })),
  };
  return [
    `Portfolio snapshot (percent values are already in %):`,
    JSON.stringify(snapshot),
    ``,
    `Deploy $${Math.round(p.deployable).toLocaleString("en-US")} of dry powder across these holdings. Return the allocation plan as JSON.`,
  ].join("\n");
}

// Hard wall-clock deadline for the whole call, fired by an AbortController on
// elapsed time (the SDK's `timeout` is an idle timeout that resets on every
// streamed chunk, so adaptive thinking — which streams deltas while it thinks —
// never trips it). 55s fires safely inside the route's 60s maxDuration, turning
// a slow tail into a catchable abort instead of a bare platform 504. No retry
// budget: a retry on a near-deadline request would blow the ceiling anyway.
const DEADLINE_MS = 55_000;

export async function generateAllocation(
  req: AllocatorRequest
): Promise<{ plan: AllocationPlan; costUSD: number | null }> {
  // reads ANTHROPIC_API_KEY; caller checks allocatorConfigured() first. Stream +
  // finalMessage keeps the connection alive while the model thinks.
  const client = new Anthropic({ timeout: 55_000, maxRetries: 0 });
  genCount += 1;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), DEADLINE_MS);
  try {
    const stream = client.messages.stream(
      {
        model: ALLOCATOR_MODEL,
        max_tokens: 6000,
        // Adaptive thinking lets the model reason through the tradeoffs; the
        // schema constrains the final shape, so no reasoning leaks into the JSON.
        thinking: { type: "adaptive" },
        system: SYSTEM,
        output_config: {
          format: { type: "json_schema", schema: PLAN_SCHEMA },
          effort: ALLOCATOR_EFFORT,
        },
        messages: [{ role: "user", content: buildUserMessage(req) }],
      },
      { signal: controller.signal }
    );

    const response = await stream.finalMessage();
    if (response.stop_reason === "refusal") {
      throw new Error("allocation generation declined");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("allocation truncated: hit max_tokens before completing");
    }
    for (const block of response.content) {
      if (block.type === "text") {
        return {
          plan: JSON.parse(block.text) as AllocationPlan,
          costUSD: usdCost(ALLOCATOR_MODEL, response.usage),
        };
      }
    }
    throw new Error("empty allocation response");
  } finally {
    clearTimeout(deadline);
  }
}
