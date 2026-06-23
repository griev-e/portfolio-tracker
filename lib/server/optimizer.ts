import Anthropic from "@anthropic-ai/sdk";
import type {
  OptimizerPlan,
  OptimizerRequest,
  OptimizerResponse,
} from "@/lib/optimizer/types";
import { usdCost } from "@/lib/server/cost";

/**
 * AI optimizer reasoning: the quantitative core (lib/optimizer/optimize.ts)
 * already solved for the optimal weights; Claude reviews that solution against
 * the book and writes the institutional read — the thesis, the mechanism, the
 * sharpest tradeoffs and residual risks, and a calibrated verdict. One
 * generation per day per portfolio shape + objective + constraint set, cached in
 * module scope like the yahoo/brief/allocator caches (resets on cold start —
 * accepted).
 */
const planCache = new Map<string, { at: number; data: OptimizerResponse }>();
const PLAN_TTL = 24 * 3600_000; // memory backstop; the date in the key rolls daily
const CACHE_MAX = 24;

/**
 * Claude Sonnet 4.6 with adaptive thinking. Reviewing an optimization — judging
 * whether the math's tradeoffs are worth taking for this specific book — is a
 * genuine reasoning task, but it's narrower and more grounded than the
 * dry-powder allocator's blank-slate sizing (the optimal weights are already
 * computed). Sonnet 4.6 is the right tier: strong reasoning at a third of Opus's
 * cost, with adaptive thinking to reason through the tradeoffs before committing.
 * Effort is `medium`, same as the allocator: a full `high`-effort thinking pass
 * routinely ran past the serverless function's deadline (504s at the platform
 * edge, observed in production) before it ever reached the JSON write.
 */
const OPTIMIZER_MODEL = "claude-sonnet-4-6";
const OPTIMIZER_EFFORT = "medium" as const;

/**
 * Cost backstop: cap fresh generations (cache misses that hit the API) per warm
 * instance per hour. Resets on cold start — accepted, like the caches above.
 */
const GEN_WINDOW_MS = 3600_000;
const GEN_MAX = 30;
let genWindowStart = Date.now();
let genCount = 0;

export function optimizerRateLimited(): boolean {
  const now = Date.now();
  if (now - genWindowStart > GEN_WINDOW_MS) {
    genWindowStart = now;
    genCount = 0;
  }
  return genCount >= GEN_MAX;
}

export function optimizerConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Map a provider error to an HTTP outcome. Lives here so the route never has to
 * import the Anthropic SDK (it stays confined to lib/server/*).
 */
export function optimizerErrorResponse(err: unknown): {
  status: number;
  error: string;
} {
  // A key that fails auth behaves like no key at all.
  if (err instanceof Anthropic.AuthenticationError)
    return { status: 501, error: "optimizer not configured" };
  if (err instanceof Anthropic.RateLimitError)
    return { status: 429, error: "optimizer rate limited" };
  if (err instanceof Anthropic.APIConnectionTimeoutError)
    return { status: 504, error: "optimizer review timed out — try again" };
  return { status: 502, error: "optimizer unavailable" };
}

/** Day + objective + constraint + shape scoped: a quote tick doesn't bust it. */
export function optimizerFingerprint(req: OptimizerRequest): string {
  const shape = req.shifts
    .map((s) => `${s.symbol}:${s.targetPct.toFixed(1)}`)
    .sort()
    .join(",");
  const c = `${req.constraints.maxWeightPct}/${req.constraints.minWeightPct}`;
  return `${new Date().toISOString().slice(0, 10)}|${req.objective.id}|${c}|${shape}`;
}

export function getCachedOptimization(key: string): OptimizerResponse | null {
  const hit = planCache.get(key);
  if (hit && Date.now() - hit.at < PLAN_TTL) return hit.data;
  return null;
}

export function setCachedOptimization(key: string, data: OptimizerResponse): void {
  if (planCache.size >= CACHE_MAX) {
    const oldest = planCache.keys().next().value;
    if (oldest !== undefined) planCache.delete(oldest);
  }
  planCache.set(key, { at: Date.now(), data });
}

/** Stable system prompt — no dates interpolated, keeps the prefix cacheable. */
const SYSTEM = `You are the portfolio-construction desk for grieve, a private portfolio analytics terminal. A quantitative optimizer has already solved for an optimal long-only weight vector on one investor's existing holdings, for a stated objective (e.g. maximum Sharpe, minimum volatility, risk parity, maximum diversification, income, quality) under per-name weight constraints. You receive: the objective, the constraints, the before/after risk-return metrics (expected return, volatility, Sharpe, diversification ratio, effective number of holdings, top weight, yield, beta), the implementation turnover, and the largest weight shifts with each name's valuation, quality and risk characteristics.

Your job: review this optimization like a buy-side PM signing off on a construction decision. Explain what the optimizer actually did to the book, judge whether the tradeoffs are worth taking for this specific portfolio, and surface what the investor gives up and what risk remains.

Rules of engagement:
- The weights are already solved — do NOT propose different weights or invent new ones. Reason about the solution you're given.
- Only reference symbols present in the shifts list. Never invent tickers.
- Tie every claim to specifics in the data — a metric delta, a valuation, a concentration figure, a turnover cost. No filler, no boilerplate.
- "assessment" explains the mechanism: which exposures the objective pulled the book toward or away from, and why that follows from the objective. Be concrete.
- "keyShifts" are the few moves that carry the thesis (highest conviction first), each tied to why the optimizer made it. action is one of: increase, decrease, exit, initiate.
- "tradeoffs" are honest costs of adopting this solution — e.g. concentration for return, yield given up for lower vol, high turnover, model-estimate fragility.
- "risks" are residual risks the optimized book still carries (single-factor exposure, estimation risk in the covariance model, thin diversification).
- "verdict" is a calibrated bottom line: implement in full, implement partially, or pass — with the reason. "confidence" reflects how robust the call is given the data.

This is model-based portfolio construction — not personalized investment advice and not a return forecast. The covariance and expected returns are structural estimates; be honest about that. Do not invent numbers absent from the data.

Respond strictly with the requested JSON.`;

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "thesis",
    "assessment",
    "keyShifts",
    "tradeoffs",
    "risks",
    "verdict",
    "confidence",
  ],
  properties: {
    thesis: {
      type: "string",
      description:
        "Overall read on what the optimizer did and whether it's worth implementing for this book.",
    },
    assessment: {
      type: "string",
      description:
        "How the objective reshaped the book — the mechanism, in concrete terms, tied to the metric deltas.",
    },
    keyShifts: {
      type: "array",
      description: "The few weight moves that carry the thesis, highest conviction first. At most 6.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["symbol", "action", "detail"],
        properties: {
          symbol: {
            type: "string",
            description: "Ticker, must be one of the shift symbols.",
          },
          action: {
            type: "string",
            enum: ["increase", "decrease", "exit", "initiate"],
          },
          detail: {
            type: "string",
            description: "Why the optimizer made this move, tied to specifics.",
          },
        },
      },
    },
    tradeoffs: {
      type: "array",
      description: "Honest costs of adopting this solution.",
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
    risks: {
      type: "array",
      description: "Residual risks the optimized book still carries.",
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
    verdict: {
      type: "string",
      description:
        "Calibrated bottom line: implement, partially implement, or pass — with the reason.",
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
};

function buildUserMessage(req: OptimizerRequest): string {
  const snapshot = {
    objective: req.objective.label,
    constraints: {
      maxPositionPct: req.constraints.maxWeightPct,
      minPositionPct: req.constraints.minWeightPct,
    },
    cashWeightPct: req.cashWeightPct,
    turnoverPct: req.turnoverPct,
    metricsBefore: req.before,
    metricsAfter: req.after,
    largestShifts: req.shifts.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      fromPct: s.currentPct,
      toPct: s.targetPct,
      deltaPct: s.deltaPct,
      forwardPE: s.forwardPE,
      dividendYieldPct: s.dividendYieldPct,
      roicPct: s.roicPct,
      beta: s.beta,
      volPct: s.volPct,
    })),
  };
  return [
    `Optimization to review (percent values are already in %):`,
    JSON.stringify(snapshot),
    ``,
    `The optimizer solved for "${req.objective.label}" on this book. Review the solution and return the institutional read as JSON.`,
  ].join("\n");
}

export async function generateOptimization(
  req: OptimizerRequest
): Promise<{ plan: OptimizerPlan; costUSD: number | null }> {
  // reads ANTHROPIC_API_KEY; caller checks optimizerConfigured() first. Stream +
  // finalMessage keeps the connection alive while the model thinks. The SDK
  // timeout is kept well under the route's maxDuration (60s) so a slow turn
  // throws a catchable APIConnectionTimeoutError instead of the platform
  // killing the function and returning a bare 504; no retry budget, since a
  // retry on a near-deadline request would blow through the ceiling anyway.
  const client = new Anthropic({ timeout: 45_000, maxRetries: 0 });
  genCount += 1;
  const stream = client.messages.stream({
    model: OPTIMIZER_MODEL,
    // Thinking tokens count against max_tokens — too tight a cap truncates the
    // run before the structured JSON gets written.
    max_tokens: 8_000,
    // Adaptive thinking lets the model reason through the tradeoffs; the schema
    // constrains the final shape, so no reasoning leaks into the JSON.
    thinking: { type: "adaptive" },
    system: SYSTEM,
    output_config: {
      format: { type: "json_schema", schema: PLAN_SCHEMA },
      effort: OPTIMIZER_EFFORT,
    },
    messages: [{ role: "user", content: buildUserMessage(req) }],
  });

  const response = await stream.finalMessage();
  if (response.stop_reason === "refusal") {
    throw new Error("optimization review declined");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("optimization review truncated: hit max_tokens before completing");
  }
  for (const block of response.content) {
    if (block.type === "text") {
      try {
        return {
          plan: JSON.parse(block.text) as OptimizerPlan,
          costUSD: usdCost(OPTIMIZER_MODEL, response.usage),
        };
      } catch {
        throw new Error(`optimization review returned unparseable JSON: ${block.text.slice(0, 200)}`);
      }
    }
  }
  throw new Error("empty optimization response");
}
