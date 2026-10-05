import OpenAI from "openai";

import { AIProviderError } from "@/lib/ai/AIProvider";
import { env } from "@/lib/env";

/** docs/db-redesign.md §8.1: luna for every purpose; override with OPENAI_MODEL. */
export const DEFAULT_CHAT_MODEL = "gpt-5.6-luna";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

let client: OpenAI | null = null;

/**
 * One client for the process. The SDK owns retries (3, with backoff that
 * honours Retry-After) and the 60 s timeout — there is deliberately no
 * outer retry loop, which used to multiply billed calls.
 */
export function getOpenAIClient(): OpenAI {
  if (client) return client;
  if (!env.OPENAI_API_KEY) {
    throw new AIProviderError("openai", new Error("OPENAI_API_KEY is not set."));
  }
  client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 3, timeout: 60_000 });
  return client;
}

/** Tests inject a fake client; pass null to reset. */
export function setOpenAIClientForTesting(fake: OpenAI | null): void {
  client = fake;
}

export function getChatModel(): string {
  return env.OPENAI_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}
