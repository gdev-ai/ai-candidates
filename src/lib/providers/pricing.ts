/**
 * Price table for every paid provider call, so provider_calls.cost_usd is a
 * real measured number (docs/db-redesign.md §2.4, §5). Prices are USD and
 * were taken from the providers' pricing pages on 2026-09-30 / 2026-10-04
 * (Claude: 2026-10-20).
 */

interface TokenPrice {
  /** USD per 1M uncached input tokens. */
  input: number;
  /** USD per 1M output tokens (thinking is billed as output). */
  output: number;
  /**
   * Prompts above `from` total input tokens are billed at these rates for
   * the whole request.
   */
  longContext?: { from: number; input: number; output: number };
}

/** Cache reads cost 0.1x the input rate; 5-minute cache writes 1.25x. */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export const ANTHROPIC_PRICING: Record<string, TokenPrice> = {
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    longContext: { from: 100_000, input: 0.5, output: 2.5 },
  },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

/** Serper: prepaid credits, $1 per 1,000 (1 credit per 10-result page). */
export const SERPER_USD_PER_CREDIT = 0.001;
/** SerpApi runs on the free plan (no per-search charge). */
export const SERPAPI_USD_PER_SEARCH = 0;
/** Apify supreme_coder: $0.005 per profile + $0.00005 per run start. */
export const APIFY_SUPREME_USD_PER_PROFILE = 0.005;
export const APIFY_RUN_START_USD = 0.0001;
/** HarvestAPI direct API, pay-as-you-go (the response also reports `cost`). */
export const HARVESTAPI_USD_PER_PROFILE = 0.0064;

function priceFor(model: string): TokenPrice | null {
  if (ANTHROPIC_PRICING[model]) return ANTHROPIC_PRICING[model];
  // Tolerate a dated snapshot id ("claude-haiku-5-5-20261001").
  const base = Object.keys(ANTHROPIC_PRICING)
    .sort((a, b) => b.length - a.length)
    .find((name) => model.startsWith(`${name}-`));
  return base ? (ANTHROPIC_PRICING[base] ?? null) : null;
}

export interface TokenUsage {
  /** Uncached input tokens (the API's `input_tokens`). */
  inputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  outputTokens: number;
}

/** USD cost of one Claude call, or null for a model missing from the table. */
export function anthropicCostUsd(
  model: string,
  usage: TokenUsage,
): number | null {
  const price = priceFor(model);
  if (!price) return null;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const promptTokens = usage.inputTokens + cacheRead + cacheWrite;
  const long =
    price.longContext && promptTokens > price.longContext.from
      ? price.longContext
      : null;
  const input = long?.input ?? price.input;
  const output = long?.output ?? price.output;
  const usd =
    (usage.inputTokens * input +
      cacheRead * input * CACHE_READ_MULTIPLIER +
      cacheWrite * input * CACHE_WRITE_MULTIPLIER +
      usage.outputTokens * output) /
    1_000_000;
  return roundUsd(usd);
}

/**
 * Apify's per-run cap: profiles × price + the start event + one profile of
 * headroom. Verified live 2026-10-04: with exactly n × $0.005 + $0.0001 the
 * actor stopped early ("reached the max total charge of 0.0051 USD"), so a
 * batch could lose its last profile. Failed profiles aren't charged, so
 * the real charge stays ≤ n × $0.005 + start.
 */
export function apifyMaxChargeUsd(profileCount: number): number {
  return roundUsd(
    (profileCount + 1) * APIFY_SUPREME_USD_PER_PROFILE + APIFY_RUN_START_USD,
  );
}

/** provider_calls.cost_usd is numeric(12,6). */
export function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
