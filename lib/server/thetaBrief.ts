import Anthropic from "@anthropic-ai/sdk";
import type {
  ThetaBrief,
  ThetaBriefRequest,
  ThetaBriefResponse,
} from "@/lib/theta/intelligence";
import { AiCache, GenLimiter, mapAnthropicError } from "@/lib/server/aiEndpoint";
import { usdCost } from "@/lib/server/cost";

/**
 * theta's money brief: one Claude call per day per ledger shape, cached in
 * module scope (resets on cold start — accepted, like alpha's brief).
 *
 * Sonnet 4.6 with adaptive thinking at `high` effort. The brief is now an
 * on-demand, user-triggered read (not an every-visit summary), so it earns the
 * deeper reasoning pass: weighing the month's flows, budget pacing and goal
 * tradeoffs before committing to wins / watch-outs / moves. The JSON schema
 * still constrains the final shape.
 */
const BRIEF_MODEL = "claude-sonnet-4-6";
const BRIEF_EFFORT = "high" as const;

const cache = new AiCache<ThetaBriefResponse>(24 * 3600_000, 20);
const genLimiter = new GenLimiter(3600_000, 40);

export const thetaBriefRateLimited = (): boolean => genLimiter.limited();

export function thetaBriefConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export const thetaBriefErrorResponse = (err: unknown) =>
  mapAnthropicError(err, {
    notConfigured: "brief not configured",
    rateLimited: "brief provider rate limited",
    unavailable: "brief provider unavailable",
  });

/** Day-scoped + ledger-shape-scoped so an edit refreshes it, a re-render doesn't. */
export function thetaBriefFingerprint(req: ThetaBriefRequest): string {
  const s = req.snapshot;
  const shape = [
    Math.round(s.netWorth),
    Math.round(s.income),
    Math.round(s.expenses),
    s.budgets.map((b) => `${b.category}:${Math.round(b.spent)}/${b.limit}`).join(","),
    s.goals.map((g) => `${g.name}:${Math.round(g.saved)}`).join(","),
  ].join("|");
  return `${new Date().toISOString().slice(0, 10)}|${shape}`;
}

export const getCachedThetaBrief = (key: string): ThetaBriefResponse | null =>
  cache.get(key);
export const setCachedThetaBrief = (key: string, data: ThetaBriefResponse): void =>
  cache.set(key, data);

const SYSTEM = `You are the money-brief writer for theta, a private personal-finance terminal. You receive a JSON snapshot of one person's finances this month: net worth and its change, income, spending, savings rate, spending by category, budgets (limit vs spent), savings goals, and upcoming recurring charges.

Write a sharp, factual brief in the voice of a thoughtful personal-CFO note: concrete numbers, plain language, no filler, no pleasantries. Each section earns its place.

- headline: one crisp line capturing the month's financial character.
- summary: 2-3 sentences on the state of the money — what's flowing in vs out, the savings rate, and the net-worth direction.
- wins: up to 3 specific things going well, each quantified (e.g. "Saved 44% of income", "Dining 8% under budget").
- watchOuts: up to 3 specific risks, each quantified (a budget over its limit, a category running hot, heavy fixed costs).
- moves: up to 3 concrete, grounded suggestions tied to the numbers — each a short title plus a 1-2 sentence detail. Frame as observations and options, never as guarantees.
- goalNote: one line on goal pacing — which goal is closest, or whether contributions are on track for the target dates.

Use only the numbers provided; never invent figures. This is general financial information, not personalized investment advice. Respond strictly with the requested JSON.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "wins", "watchOuts", "moves", "goalNote"],
  properties: {
    headline: { type: "string", description: "One-line take on the month." },
    summary: { type: "string", description: "2-3 sentence state of the finances with key numbers." },
    wins: { type: "array", items: { type: "string" }, description: "Up to 3 quantified positives." },
    watchOuts: { type: "array", items: { type: "string" }, description: "Up to 3 quantified risks." },
    moves: {
      type: "array",
      description: "Up to 3 grounded suggestions.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail"],
        properties: { title: { type: "string" }, detail: { type: "string" } },
      },
    },
    goalNote: { type: "string", description: "One line on goal pacing." },
  },
};

function buildUserMessage(req: ThetaBriefRequest): string {
  return [
    `Finance snapshot (dollar figures are USD; percent values are already in %):`,
    JSON.stringify(req.snapshot),
  ].join("\n");
}

export async function generateThetaBrief(
  req: ThetaBriefRequest
): Promise<{ brief: ThetaBrief; costUSD: number | null }> {
  // Stream + finalMessage keeps the HTTP connection alive while the model
  // thinks, so a slow adaptive-thinking turn doesn't trip the SDK timeout; the
  // route caps total duration.
  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  genLimiter.record();
  const stream = client.messages.stream({
    model: BRIEF_MODEL,
    max_tokens: 4000,
    // Adaptive thinking lets the model reason through the month before
    // committing; the schema constrains the final JSON so no reasoning leaks.
    thinking: { type: "adaptive" },
    system: SYSTEM,
    output_config: {
      format: { type: "json_schema", schema: SCHEMA },
      effort: BRIEF_EFFORT,
    },
    messages: [{ role: "user", content: buildUserMessage(req) }],
  });

  const response = await stream.finalMessage();
  if (response.stop_reason === "refusal") throw new Error("brief generation declined");
  const text = response.content.find((b) => b.type === "text");
  if (!text) throw new Error("empty brief response");
  return {
    brief: JSON.parse(text.text) as ThetaBrief,
    costUSD: usdCost(BRIEF_MODEL, response.usage),
  };
}
