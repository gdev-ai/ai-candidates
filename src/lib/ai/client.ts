import Anthropic from "@anthropic-ai/sdk";

import { AIProviderError } from "@/lib/ai/AIProvider";
import { env } from "@/lib/env";

/** Claude Haiku 5.5 for every purpose; override with ANTHROPIC_MODEL. */
export const DEFAULT_CHAT_MODEL = "claude-haiku-5-5";

let client: Anthropic | null = null;

/**
 * One client for the process. The SDK owns retries (3, with backoff that
 * honours Retry-After) and the 60 s timeout — there is deliberately no
 * outer retry loop, which used to multiply billed calls.
 */
export function getAnthropicClient(): Anthropic {
  if (client) return client;
  if (!env.ANTHROPIC_API_KEY) {
    throw new AIProviderError(
      "anthropic",
      new Error("ANTHROPIC_API_KEY is not set."),
    );
  }
  client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    maxRetries: 3,
    timeout: 60_000,
    ...(env.ANTHROPIC_WORKSPACE_ID
      ? {
          defaultHeaders: {
            "anthropic-workspace-id": env.ANTHROPIC_WORKSPACE_ID,
          },
        }
      : {}),
  });
  return client;
}

/** Tests inject a fake client; pass null to reset. */
export function setAnthropicClientForTesting(fake: Anthropic | null): void {
  client = fake;
}

export function getChatModel(): string {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}

/** Candidate scoring can run on a stronger model than the other calls. */
export function getMatchModel(): string {
  return env.ANTHROPIC_MATCH_MODEL?.trim() || getChatModel();
}
