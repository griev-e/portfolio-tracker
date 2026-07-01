import Anthropic from "@anthropic-ai/sdk";
import type {
  OptimizerPlan,
  OptimizerRequest,
  OptimizerResponse,
} from "@/lib/optimizer/types";
import { AiCache, GenLimiter, mapAnthropicError } from "@/lib/server/aiEndpoint";
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
const PLAN_TTL = 24 * 3600_000; // memory backstop; the date in the key rolls daily
const planCache = new AiCache<OptimizerResponse>(PLAN_TTL, 24);

/**
 * Claude Sonnet 4.6 with adaptive thinking at `low` effort. Reviewing an
 * optimization — judging whether the math's tradeoffs are worth taking for this
 * specific book — is narrower and more grounded than the dry-powder allocator's
 * blank-slate sizing (the optimal weights are already computed): the schema does
 * the structural heavy lifting, and a shallow thinking pass lets the model reason
 * through the tradeoffs before committing.
 *
 * Sonnet (not Haiku) because the `effort` parameter and adaptive thinking are
 * unsupported on Haiku 4.5 — that pairing is rejected by the API, so the review
 * never reached the JSON write. Sonnet supports both; `low` effort keeps it well
 * inside the deadline while still earning a real reasoning pass on a grounded
 * result.
 */
export const OPTIMIZER_MODEL = "claude-sonnet-4-6";
export const OPTIMIZER_EFFORT = "low" as const;

/**
 * Cost backstop: cap fresh generations (cache misses that hit the API) per warm
 * instance per hour. Resets on cold start — accepted, like the caches above.
 */
const genLimiter = new GenLimiter(3600_000, 30);

export const optimizerRateLimited = (): boolean => genLimiter.limited();

export function optimizerConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export const optimizerErrorResponse = (err: unknown) =>
  mapAnthropicError(err, {
    notConfigured: "optimizer not configured",
    rateLimited: "optimizer rate limited",
    timedOut: "optimizer review timed out — try again",
    unavailable: "optimizer unavailable",
  });

/** Day + objective + constraint + shape scoped: a quote tick doesn't bust it. */
export function optimizerFingerprint(req: OptimizerRequest): string {
  const shape = req.shifts
    .map((s) => `${s.symbol}:${s.targetPct.toFixed(1)}`)
    .sort()
    .join(",");
  const c = `${req.constraints.maxWeightPct}/${req.constraints.minWeightPct}`;
  return `${new Date().toISOString().slice(0, 10)}|${req.objective.id}|${c}|${shape}`;
}

export const getCachedOptimization = (key: string): OptimizerResponse | null =>
  planCache.get(key);
export const setCachedOptimization = (key: string, data: OptimizerResponse): void =>
  planCache.set(key, data);

/** Stable system prompt — no per-request interpolation, so it's byte-identical
 *  across calls. (No `cache_control` is set: the per-day-per-shape module cache
 *  already dedupes the only repetition that exists.) */
const SYSTEM = `You are the portfolio-construction desk for alpha, a private portfolio analytics terminal. A quantitative optimizer has already solved for an optimal long-only weight vector on one investor's existing holdings, for a stated objective (e.g. maximum Sharpe, minimum volatility, risk parity, maximum diversification, income, quality) under per-name weight constraints. You receive: the objective, the constraints, the before/after risk-return metrics (expected return, volatility, Sharpe, diversification ratio, effective number of holdings, top weight, yield, beta), the implementation turnover, and the largest weight shifts with each name's valuation, quality and risk characteristics.

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

// Hard wall-clock deadline for the whole call. `low` effort typically lands
// in single-digit-to-low-teens seconds for this prompt size (capped at 16
// shifts client-side), but adaptive thinking has no fixed token/time budget —
// `effort` only biases depth/verbosity, it doesn't bound latency — so the
// tail occasionally runs well past the typical case. 45s gives that tail
// genuine room without pinning the deadline to the optimistic estimate (which
// just turns ordinary variance into spurious aborts), while still firing
// safely inside the route's maxDuration (60s) — a slow turn raises a
// catchable abort instead of the platform killing the function outright and
// returning a bare 504. The SDK's own `timeout` option resets on every
// streamed chunk (it's an idle timeout, not a total one) — adaptive thinking
// streams deltas the whole time it's "thinking", so that option alone never
// fires here. This timer fires on elapsed time regardless of stream activity.
const DEADLINE_MS = 45_000;

export async function generateOptimization(
  req: OptimizerRequest
): Promise<{ plan: OptimizerPlan; costUSD: number | null }> {
  // reads ANTHROPIC_API_KEY; caller checks optimizerConfigured() first. No
  // retry budget: a retry on a near-deadline request would blow through the
  // ceiling anyway.
  const client = new Anthropic({ timeout: 45_000, maxRetries: 0 });
  genLimiter.record();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), DEADLINE_MS);
  try {
    const stream = client.messages.stream(
      {
        model: OPTIMIZER_MODEL,
        // Thinking tokens count against max_tokens — too tight a cap truncates
        // the run before the structured JSON gets written. `low` effort uses
        // much less of this than `medium` did, but the cap stays generous.
        max_tokens: 6_000,
        // Adaptive thinking lets the model reason through the tradeoffs; the
        // schema constrains the final shape, so no reasoning leaks into the
        // JSON.
        thinking: { type: "adaptive" },
        system: SYSTEM,
        output_config: {
          format: { type: "json_schema", schema: PLAN_SCHEMA },
          effort: OPTIMIZER_EFFORT,
        },
        messages: [{ role: "user", content: buildUserMessage(req) }],
      },
      { signal: controller.signal }
    );

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
  } finally {
    clearTimeout(deadline);
  }
}
