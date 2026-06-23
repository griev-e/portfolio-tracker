/**
 * USD cost estimate for one Anthropic call, derived from token usage.
 *
 * Prices are per **million** tokens (input / output). Cache writes bill at
 * 1.25× input and cache reads at 0.1× input — folded in so the figure matches
 * the actual line item even for cached calls. Returns null for an unknown model
 * so the UI can simply omit the footer rather than show a wrong number.
 */
export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

const PRICING: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
};

export function usdCost(model: string, usage: TokenUsage): number | null {
  const p = PRICING[model];
  if (!p) return null;
  const input = usage.input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cost =
    (input * p.in +
      cacheWrite * p.in * 1.25 +
      cacheRead * p.in * 0.1 +
      output * p.out) /
    1_000_000;
  return cost;
}
