import { APIError } from "openai";

import { AIProviderError } from "@/lib/ai/AIProvider";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, getOpenAIClient } from "@/lib/ai/client";
import type { CallContext } from "@/lib/ai/structured";
import { recordProviderCall } from "@/lib/providers/callLog";
import { openAICostUsd } from "@/lib/providers/pricing";

/** The API takes up to 2048 inputs per request; we stay well below it. */
const MAX_BATCH = 256;
/** ~8k-token input limit; snippets and profiles are far shorter. */
const MAX_CHARS = 8_000;

/**
 * Embeds texts with text-embedding-3-small (1536 dims). One provider_calls
 * row per request; the vectors themselves are not stored in the log.
 */
export async function embedTexts(texts: string[], context: CallContext = {}): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getOpenAIClient();
  const vectors: number[][] = [];

  for (let start = 0; start < texts.length; start += MAX_BATCH) {
    const batch = texts
      .slice(start, start + MAX_BATCH)
      .map((text) => text.slice(0, MAX_CHARS) || " ");
    const startedAt = Date.now();
    const base = {
      provider: "openai" as const,
      purpose: "embed" as const,
      model: EMBEDDING_MODEL,
      jobId: context.jobId,
      personId: context.personId,
      searchRunId: context.searchRunId,
      userId: context.userId,
      request: { model: EMBEDDING_MODEL, inputs: batch.length, dimensions: EMBEDDING_DIMENSIONS },
    };
    try {
      const { data, request_id } = await client.embeddings
        .create({
          model: EMBEDDING_MODEL,
          input: batch,
          dimensions: EMBEDDING_DIMENSIONS,
          encoding_format: "float",
        })
        .withResponse();
      const ordered = [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
      vectors.push(...ordered);
      const tokens = data.usage?.prompt_tokens ?? 0;
      await recordProviderCall({
        ...base,
        status: "ok",
        providerRequestId: request_id ?? null,
        promptTokens: tokens,
        completionTokens: 0,
        costUsd: openAICostUsd(EMBEDDING_MODEL, { inputTokens: tokens, outputTokens: 0 }),
        latencyMs: Date.now() - startedAt,
        httpStatus: 200,
        response: { model: data.model, usage: data.usage, count: data.data.length },
      });
    } catch (error) {
      await recordProviderCall({
        ...base,
        status: "error",
        latencyMs: Date.now() - startedAt,
        httpStatus: error instanceof APIError ? (error.status ?? null) : null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AIProviderError("openai", error);
    }
  }
  return vectors;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** pgvector text form, which PostgREST accepts for a vector column. */
export function toPgVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export function fromPgVector(value: string | null | undefined): number[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}
