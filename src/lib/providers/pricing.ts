/**
 * Price table for every paid provider call, so provider_calls.cost_usd is a
 * real measured number (docs/db-redesign.md §2.4, §5). Prices are USD and
 * were taken from the providers' pricing pages on 2026-09-30 / 2026-10-04.
 */

interface TokenPrice {
  /** USD per 1M uncached input tokens. */
  input: number;
  /** USD per 1M cached input tokens. */
  cachedInput: number;
  /** USD per 1M output tokens (reasoning tokens are billed as output). */
  output: number;
}

// Cached-input prices that the pricing page doesn't list separately use the
// usual 10%-of-input rate.
export const OPENAI_PRICING: Record<string, TokenPrice> = {
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
  "text-embedding-3-small": { input: 0.02, cachedInput: 0.02, output: 0 },
};

/** Flex processing is billed at half the standard rate. */
export const FLEX_DISCOUNT = 0.5;

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
  if (OPENAI_PRICING[model]) return OPENAI_PRICING[model];
  // Responses can report a dated snapshot ("gpt-5.6-luna-2026-08-01").
  const base = Object.keys(OPENAI_PRICING)
    .sort((a, b) => b.length - a.length)
    .find((name) => model.startsWith(`${name}-`));
  return base ? (OPENAI_PRICING[base] ?? null) : null;
}

export interface TokenUsage {
  inputTokens: number;
  cachedTokens?: number;
  outputTokens: number;
}

/** USD cost of one OpenAI call, or null for a model missing from the table. */
export function openAICostUsd(
  model: string,
  usage: TokenUsage,
  serviceTier?: string | null,
): number | null {
  const price = priceFor(model);
  if (!price) return null;
  const cached = Math.min(usage.cachedTokens ?? 0, usage.inputTokens);
  const uncached = usage.inputTokens - cached;
  const usd =
    (uncached * price.input + cached * price.cachedInput + usage.outputTokens * price.output) /
    1_000_000;
  const discounted = serviceTier === "flex" ? usd * FLEX_DISCOUNT : usd;
  return roundUsd(discounted);
}

/**
 * Apify's per-run cap: profiles × price + the start event + one profile of
 * headroom. Verified live 2026-10-04: with exactly n × $0.005 + $0.0001 the
 * actor stopped early ("reached the max total charge of 0.0051 USD"), so a
 * batch could lose its last profile. Failed profiles aren't charged, so
 * the real charge stays ≤ n × $0.005 + start.
 */
export function apifyMaxChargeUsd(profileCount: number): number {
  return roundUsd((profileCount + 1) * APIFY_SUPREME_USD_PER_PROFILE + APIFY_RUN_START_USD);
}

/** provider_calls.cost_usd is numeric(12,6). */
export function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
