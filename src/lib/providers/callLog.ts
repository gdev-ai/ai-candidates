import "server-only";

import { createLogger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";
import type { Insert } from "@/lib/supabase/types";
import type { Json } from "@/types/database.types";

/** Mirrors the provider_calls check constraints. */
export type ProviderName = "openai" | "serper" | "serpapi" | "exa" | "apify" | "harvestapi";
export type ProviderPurpose =
  | "search"
  | "enrich"
  | "job_analysis"
  | "query_gen"
  | "location_check"
  | "pre_score"
  | "match"
  | "embed";
export type ProviderCallStatus = "ok" | "empty" | "error" | "refused" | "truncated";

export interface ProviderCallRecord {
  provider: ProviderName;
  purpose: ProviderPurpose;
  status: ProviderCallStatus;
  searchRunId?: string | null;
  jobId?: string | null;
  personId?: string | null;
  userId?: string | null;
  providerRequestId?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  finishReason?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  cachedTokens?: number | null;
  reasoningTokens?: number | null;
  credits?: number | null;
  costUsd?: number | null;
  latencyMs?: number | null;
  httpStatus?: number | null;
  error?: string | null;
  /** Request as sent, minus secrets. */
  request?: unknown;
  /** Raw provider response, kept for audit and re-parsing. */
  response?: unknown;
}

/**
 * Records one external call in sourcing.provider_calls — the raw log and
 * cost ledger (docs/db-redesign.md §3.6). Returns the row id so callers can
 * link what they derived from it (search_hits, person_snapshots,
 * match_results...). Never throws: a logging failure must not fail the
 * work it describes, so callers get null and carry on.
 */
export async function recordProviderCall(record: ProviderCallRecord): Promise<string | null> {
  const row: Insert<"provider_calls"> = {
    provider: record.provider,
    purpose: record.purpose,
    status: record.status,
    search_run_id: record.searchRunId ?? null,
    job_id: record.jobId ?? null,
    person_id: record.personId ?? null,
    user_id: record.userId ?? null,
    provider_request_id: record.providerRequestId ?? null,
    model: record.model ?? null,
    prompt_version: record.promptVersion ?? null,
    finish_reason: record.finishReason ?? null,
    prompt_tokens: record.promptTokens ?? null,
    completion_tokens: record.completionTokens ?? null,
    cached_tokens: record.cachedTokens ?? null,
    reasoning_tokens: record.reasoningTokens ?? null,
    credits: record.credits ?? null,
    cost_usd: record.costUsd ?? null,
    latency_ms: record.latencyMs ?? null,
    http_status: record.httpStatus ?? null,
    error: record.error ?? null,
    request: (record.request ?? null) as Json,
    response: (record.response ?? null) as Json,
  };

  try {
    const { data, error } = await createServiceClient()
      .from("provider_calls")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  } catch (error) {
    createLogger("provider-calls").error("Failed to record provider call", {
      error,
      provider: record.provider,
      purpose: record.purpose,
    });
    return null;
  }
}
