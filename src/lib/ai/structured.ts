import { APIError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import {
  AIIncompleteResponseError,
  AIProviderError,
  AIRefusalError,
  AIResponseValidationError,
} from "@/lib/ai/AIProvider";
import { getChatModel, getOpenAIClient } from "@/lib/ai/client";
import {
  recordProviderCall,
  type ProviderPurpose,
} from "@/lib/providers/callLog";
import { openAICostUsd } from "@/lib/providers/pricing";

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
  /** Strict-mode compatible: every field required, no defaults/optionals. */
  schema: S;
  schemaName: string;
  instructions: string;
  input: string;
  effort: ReasoningEffort;
  maxOutputTokens: number;
  promptVersion: string;
  /** Only sent with effort "none" — any other effort rejects it with a 400. */
  temperature?: number;
  /** "flex" for bulk work: half price, slower; falls back to default on 429. */
  serviceTier?: "flex" | "default";
  /**
   * Default tier only: abort a call that runs longer than this and retry
   * it once. Cuts rare 90s+ stragglers that hold up a whole batch.
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

const FLEX_TIMEOUT_MS = 15 * 60_000;

interface UsageShape {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

interface ResponseShape {
  id?: string;
  model?: string;
  status?: string;
  service_tier?: string | null;
  incomplete_details?: { reason?: string } | null;
  usage?: UsageShape | null;
  output?: { type: string; content?: { type: string; refusal?: string }[] }[];
  output_parsed?: unknown;
}

function findRefusal(response: ResponseShape): string | null {
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "refusal") return part.refusal ?? "refused";
    }
  }
  return null;
}

/**
 * One structured OpenAI call through the Responses API (§8.1): strict JSON
 * schema, explicit reasoning effort and output cap, `store: false`, low
 * verbosity. Every attempt — success, refusal, truncation, schema mismatch
 * or HTTP error — is written to provider_calls with tokens and cost.
 * Truncated or refused answers throw and are not retried here.
 */
export async function runStructured<S extends z.ZodType>(
  options: StructuredCallOptions<S>,
): Promise<StructuredResult<z.infer<S>>> {
  const client = getOpenAIClient();
  const model = options.model ?? getChatModel();
  const flex = options.serviceTier === "flex";

  const body = {
    model,
    instructions: options.instructions,
    input: options.input,
    text: {
      format: zodTextFormat(options.schema, options.schemaName),
      verbosity: "low" as const,
    },
    reasoning: { effort: options.effort },
    max_output_tokens: options.maxOutputTokens,
    store: false,
    ...(options.effort === "none" && options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
  };
  const requestLog = {
    model,
    effort: options.effort,
    max_output_tokens: options.maxOutputTokens,
    schema: options.schemaName,
    service_tier: flex ? "flex" : "default",
    instructions: options.instructions,
    input: options.input,
  };
  const ctx = options.context ?? {};
  const base = {
    provider: "openai" as const,
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
  let response: ResponseShape;
  let requestId: string | null = null;
  try {
    const call = async (useFlex: boolean) =>
      client.responses
        .parse(
          useFlex ? { ...body, service_tier: "flex" as const } : body,
          useFlex
            ? { timeout: FLEX_TIMEOUT_MS, maxRetries: 0 }
            : options.timeoutMs
              ? { timeout: options.timeoutMs, maxRetries: 1 }
              : undefined,
        )
        .withResponse();
    let result;
    try {
      result = await call(flex);
    } catch (error) {
      // Flex capacity is best-effort: a 429 means "no flex capacity now".
      if (flex && error instanceof APIError && error.status === 429) {
        result = await call(false);
      } else {
        throw error;
      }
    }
    response = result.data as unknown as ResponseShape;
    requestId = result.request_id ?? null;
  } catch (error) {
    await recordProviderCall({
      ...base,
      status: "error",
      latencyMs: Date.now() - startedAt,
      httpStatus: error instanceof APIError ? (error.status ?? null) : null,
      providerRequestId:
        error instanceof APIError ? (error.requestID ?? null) : null,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AIProviderError("openai", error);
  }

  const usage = response.usage ?? {};
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cachedTokens = usage.input_tokens_details?.cached_tokens ?? 0;
  const servedModel = response.model ?? model;
  const costUsd = openAICostUsd(
    servedModel,
    { inputTokens, cachedTokens, outputTokens },
    response.service_tier,
  );
  const metrics = {
    ...base,
    model: servedModel,
    providerRequestId: requestId ?? response.id ?? null,
    finishReason:
      response.incomplete_details?.reason ?? response.status ?? null,
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    cachedTokens,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    costUsd,
    latencyMs: Date.now() - startedAt,
    httpStatus: 200,
    response,
  };

  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason ?? null;
    await recordProviderCall({
      ...metrics,
      status: "truncated",
      error: `incomplete: ${reason}`,
    });
    throw new AIIncompleteResponseError(options.schemaName, reason);
  }

  const refusal = findRefusal(response);
  if (refusal) {
    await recordProviderCall({ ...metrics, status: "refused", error: refusal });
    throw new AIRefusalError(options.schemaName, refusal);
  }

  const parsed = options.schema.safeParse(response.output_parsed);
  if (response.output_parsed == null || !parsed.success) {
    const issue = parsed.success
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
