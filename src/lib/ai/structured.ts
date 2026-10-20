import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

import {
  AIIncompleteResponseError,
  AIProviderError,
  AIRefusalError,
  AIResponseValidationError,
} from "@/lib/ai/AIProvider";
import { getAnthropicClient, getChatModel } from "@/lib/ai/client";
import { toOutputSchema } from "@/lib/ai/jsonSchema";
import {
  recordProviderCall,
  type ProviderPurpose,
} from "@/lib/providers/callLog";
import { anthropicCostUsd } from "@/lib/providers/pricing";

/** "none" turns thinking off (Haiku); the rest map to output_config.effort. */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

/** Links a call to what it was for, in provider_calls. */
export interface CallContext {
  jobId?: string | null;
  personId?: string | null;
  searchRunId?: string | null;
  userId?: string | null;
}

export interface StructuredCallOptions<S extends z.ZodType> {
  purpose: ProviderPurpose;
  /** Every field required, no defaults/optionals. */
  schema: S;
  schemaName: string;
  instructions: string;
  input: string;
  effort: ReasoningEffort;
  /** Caps thinking and the answer together. */
  maxOutputTokens: number;
  promptVersion: string;
  /**
   * Abort a call that runs longer than this and retry it once. Cuts rare
   * 90s+ stragglers that hold up a whole batch.
   */
  timeoutMs?: number;
  context?: CallContext;
  model?: string;
}

export interface StructuredResult<T> {
  data: T;
  callId: string | null;
  model: string;
  promptVersion: string;
  costUsd: number | null;
}

/**
 * Thinking can only be switched off on Haiku; elsewhere "none" runs at low
 * effort with adaptive thinking.
 */
function thinkingParams(model: string, effort: ReasoningEffort) {
  if (effort === "none") {
    return model.startsWith("claude-haiku")
      ? {
          thinking: { type: "disabled" as const },
          output_config: { effort: "low" as const },
        }
      : { output_config: { effort: "low" as const } };
  }
  return { output_config: { effort } };
}

function responseText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * One structured Claude call through the Messages API: JSON-schema
 * structured output, explicit effort and output cap. Every attempt —
 * success, refusal, truncation, schema mismatch or HTTP error — is written
 * to provider_calls with tokens and cost. Truncated or refused answers
 * throw and are not retried here.
 */
export async function runStructured<S extends z.ZodType>(
  options: StructuredCallOptions<S>,
): Promise<StructuredResult<z.infer<S>>> {
  const client = getAnthropicClient();
  const model = options.model ?? getChatModel();
  const thinking = thinkingParams(model, options.effort);

  const body = {
    model,
    max_tokens: options.maxOutputTokens,
    system: options.instructions,
    messages: [{ role: "user" as const, content: options.input }],
    ...thinking,
    output_config: {
      ...thinking.output_config,
      format: {
        type: "json_schema" as const,
        schema: toOutputSchema(options.schema),
      },
    },
  };
  const requestLog = {
    model,
    effort: options.effort,
    max_tokens: options.maxOutputTokens,
    schema: options.schemaName,
    instructions: options.instructions,
    input: options.input,
  };
  const ctx = options.context ?? {};
  const base = {
    provider: "anthropic" as const,
    purpose: options.purpose,
    jobId: ctx.jobId,
    personId: ctx.personId,
    searchRunId: ctx.searchRunId,
    userId: ctx.userId,
    model,
    promptVersion: options.promptVersion,
    request: requestLog,
  };

  const startedAt = Date.now();
  let response: Anthropic.Message;
  let requestId: string | null = null;
  try {
    const result = await client.messages
      .create(
        body,
        options.timeoutMs
          ? { timeout: options.timeoutMs, maxRetries: 1 }
          : undefined,
      )
      .withResponse();
    response = result.data;
    requestId = result.request_id ?? null;
  } catch (error) {
    await recordProviderCall({
      ...base,
      status: "error",
      latencyMs: Date.now() - startedAt,
      httpStatus:
        error instanceof Anthropic.APIError ? (error.status ?? null) : null,
      providerRequestId:
        error instanceof Anthropic.APIError ? (error.requestID ?? null) : null,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AIProviderError("anthropic", error);
  }

  const usage = response.usage;
  const uncachedTokens = usage.input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const servedModel = response.model ?? model;
  const costUsd = anthropicCostUsd(servedModel, {
    inputTokens: uncachedTokens,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens,
  });
  const metrics = {
    ...base,
    model: servedModel,
    providerRequestId: requestId ?? response.id ?? null,
    finishReason: response.stop_reason ?? null,
    promptTokens: uncachedTokens + cacheReadTokens + cacheWriteTokens,
    completionTokens: outputTokens,
    cachedTokens: cacheReadTokens,
    // Thinking is billed inside output_tokens; the API doesn't split it out.
    reasoningTokens: null,
    costUsd,
    latencyMs: Date.now() - startedAt,
    httpStatus: 200,
    response,
  };

  if (
    response.stop_reason === "max_tokens" ||
    response.stop_reason === "model_context_window_exceeded"
  ) {
    const reason = response.stop_reason;
    await recordProviderCall({
      ...metrics,
      status: "truncated",
      error: `incomplete: ${reason}`,
    });
    throw new AIIncompleteResponseError(options.schemaName, reason);
  }

  if (response.stop_reason === "refusal") {
    const details = response.stop_details;
    const refusal = details?.explanation ?? details?.category ?? "refused";
    await recordProviderCall({ ...metrics, status: "refused", error: refusal });
    throw new AIRefusalError(options.schemaName, refusal);
  }

  const raw = parseJson(responseText(response));
  const parsed = options.schema.safeParse(raw);
  if (raw === undefined || !parsed.success) {
    const issue =
      raw === undefined || parsed.success
        ? "no parsed output"
        : parsed.error.issues[0]?.message;
    await recordProviderCall({
      ...metrics,
      status: "error",
      error: `invalid output: ${issue}`,
    });
    throw new AIResponseValidationError(
      options.schemaName,
      parsed.success ? undefined : parsed.error,
    );
  }

  const callId = await recordProviderCall({ ...metrics, status: "ok" });
  return {
    data: parsed.data,
    callId,
    model: servedModel,
    promptVersion: options.promptVersion,
    costUsd,
  };
}
