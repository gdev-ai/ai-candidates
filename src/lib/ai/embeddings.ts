import { AIProviderError } from "@/lib/ai/AIProvider";
import type { CallContext } from "@/lib/ai/structured";
import { env } from "@/lib/env";
import { recordProviderCall } from "@/lib/providers/callLog";
import { fetchJson, ProviderHttpError } from "@/lib/providers/http";

/** Supabase's built-in model, served by supabase/functions/embed. */
export const EMBEDDING_MODEL = "gte-small";
export const EMBEDDING_DIMENSIONS = 384;

/**
 * gte-small takes ~125 ms of CPU per text and the Edge Runtime stops a
 * request at ~2 s of CPU (546 WORKER_RESOURCE_LIMIT), so batches stay small
 * and run side by side. The function accepts at most 8.
 */
const MAX_BATCH = 4;
const CONCURRENCY = 6;
/** gte-small reads at most 512 tokens; snippets and profiles are shorter. */
const MAX_CHARS = 2_000;
const TIMEOUT_MS = 60_000;

interface EmbedResponse {
  model: string;
  dimensions: number;
  embeddings: number[][];
}

async function embedBatch(
  batch: string[],
  context: CallContext,
): Promise<number[][]> {
  const startedAt = Date.now();
  const base = {
    provider: "supabase" as const,
    purpose: "embed" as const,
    model: EMBEDDING_MODEL,
    jobId: context.jobId,
    personId: context.personId,
    searchRunId: context.searchRunId,
    userId: context.userId,
    request: { model: EMBEDDING_MODEL, inputs: batch.length },
  };
  try {
    const { body, status } = await fetchJson<EmbedResponse>(
      "supabase-embed",
      `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/embed`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: batch }),
        timeoutMs: TIMEOUT_MS,
      },
    );
    if (
      body.embeddings?.length !== batch.length ||
      body.dimensions !== EMBEDDING_DIMENSIONS
    ) {
      throw new ProviderHttpError(
        "supabase-embed",
        status,
        `expected ${batch.length} × ${EMBEDDING_DIMENSIONS} vectors, got ${body.embeddings?.length ?? 0} × ${body.dimensions}`,
      );
    }
    await recordProviderCall({
      ...base,
      status: "ok",
      costUsd: 0,
      latencyMs: Date.now() - startedAt,
      httpStatus: status,
      response: { model: body.model, count: body.embeddings.length },
    });
    return body.embeddings;
  } catch (error) {
    await recordProviderCall({
      ...base,
      status: "error",
      latencyMs: Date.now() - startedAt,
      httpStatus: error instanceof ProviderHttpError ? error.status : null,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AIProviderError("supabase", error);
  }
}

/**
 * Embeds texts with gte-small (384 dims, unit length) through the `embed`
 * Edge Function. One provider_calls row per batch; the vectors themselves
 * are not stored in the log. Free: it runs on the project's own compute.
 */
export async function embedTexts(
  texts: string[],
  context: CallContext = {},
): Promise<number[][]> {
  const batches: string[][] = [];
  for (let start = 0; start < texts.length; start += MAX_BATCH) {
    batches.push(
      texts
        .slice(start, start + MAX_BATCH)
        .map((text) => text.slice(0, MAX_CHARS) || " "),
    );
  }
  const results: number[][][] = new Array(batches.length);
  for (let start = 0; start < batches.length; start += CONCURRENCY) {
    const group = batches.slice(start, start + CONCURRENCY);
    const vectors = await Promise.all(
      group.map((batch) => embedBatch(batch, context)),
    );
    vectors.forEach((v, i) => (results[start + i] = v));
  }
  return results.flat();
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

export function fromPgVector(
  value: string | null | undefined,
): number[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}
