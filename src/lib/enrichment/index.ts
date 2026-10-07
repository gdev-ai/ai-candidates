import { extractLinkedInSlug, normalizeUrl } from "@/lib/candidates/identity";
import {
  getApifyRemainingUsd,
  getDatasetItems,
  isApifyConfigured,
  type ApifyRun,
} from "@/lib/enrichment/apify";
import {
  fetchHarvestProfile,
  isHarvestConfigured,
} from "@/lib/enrichment/harvestapi";
import {
  isSupremeError,
  mapSupremeItem,
  type SupremeItem,
} from "@/lib/enrichment/mapSupreme";
import {
  isFresh,
  markEnrichment,
  writeEnrichedProfile,
} from "@/lib/enrichment/persist";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { recordProviderCall } from "@/lib/providers/callLog";
import { APIFY_SUPREME_USD_PER_PROFILE } from "@/lib/providers/pricing";
import type { SourcingClient } from "@/lib/supabase/types";

/** Below this much Apify credit left, enrichment moves to the fallback (§8.3). */
export const APIFY_RESERVE_USD = 0.25;

const log = createLogger("enrichment");

export interface EnrichmentTarget {
  personId: string;
  url: string;
}

export interface EnrichmentContext {
  searchRunId?: string | null;
  jobId?: string | null;
  userId?: string | null;
}

/**
 * Splits people into those that need a fetch and those served from the
 * global cache (enriched within the TTL). Only LinkedIn profiles qualify.
 */
export async function selectForEnrichment(
  db: SourcingClient,
  personIds: string[],
): Promise<{ targets: EnrichmentTarget[]; cached: string[] }> {
  if (personIds.length === 0) return { targets: [], cached: [] };
  const { data, error } = await db
    .from("people")
    .select(
      "id, profile_url, identity_key, enrichment_status, enriched_at, photo_url, photo_fetched_at",
    )
    .in("id", personIds);
  if (error) throw error;
  const targets: EnrichmentTarget[] = [];
  const cached: string[] = [];
  for (const person of data ?? []) {
    if (isFresh(person)) {
      cached.push(person.id);
      continue;
    }
    if (!person.identity_key.startsWith("linkedin:") || !person.profile_url)
      continue;
    targets.push({ personId: person.id, url: person.profile_url });
  }
  return { targets, cached };
}

export type EnrichmentRoute = "apify" | "harvestapi" | "pending";

/**
 * Budget guard: Apify while its monthly credit covers this batch plus the
 * reserve; otherwise HarvestAPI if configured; otherwise leave the people
 * `pending` for after the credit resets. ENRICHMENT_PROVIDER=harvestapi
 * skips Apify entirely.
 */
export async function chooseEnrichmentRoute(
  count: number,
): Promise<{ route: EnrichmentRoute; remainingUsd: number | null }> {
  if (count === 0) return { route: "pending", remainingUsd: null };
  if (env.ENRICHMENT_PROVIDER === "harvestapi" && isHarvestConfigured()) {
    return { route: "harvestapi", remainingUsd: null };
  }
  let remainingUsd: number | null = null;
  if (isApifyConfigured()) {
    try {
      remainingUsd = await getApifyRemainingUsd();
      if (
        remainingUsd - count * APIFY_SUPREME_USD_PER_PROFILE >=
        APIFY_RESERVE_USD
      ) {
        return { route: "apify", remainingUsd };
      }
    } catch (error) {
      log.warn("Apify limits check failed", { error });
    }
  }
  return {
    route: isHarvestConfigured() ? "harvestapi" : "pending",
    remainingUsd,
  };
}

/** Maps dataset items back to the people we asked for, by `inputUrl`. */
export function matchItemsToTargets(
  items: SupremeItem[],
  targets: EnrichmentTarget[],
): {
  matched: { target: EnrichmentTarget; item: SupremeItem }[];
  failed: EnrichmentTarget[];
  missing: EnrichmentTarget[];
} {
  const byUrl = new Map<string, EnrichmentTarget>();
  const bySlug = new Map<string, EnrichmentTarget>();
  for (const t of targets) {
    byUrl.set(normalizeUrl(t.url), t);
    const slug = extractLinkedInSlug(t.url);
    if (slug) bySlug.set(slug, t);
  }
  const matched: { target: EnrichmentTarget; item: SupremeItem }[] = [];
  const failed: EnrichmentTarget[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const input = item.inputUrl ?? "";
    const target =
      byUrl.get(normalizeUrl(input)) ??
      bySlug.get(extractLinkedInSlug(input) ?? "");
    if (!target || seen.has(target.personId)) continue;
    seen.add(target.personId);
    if (isSupremeError(item)) failed.push(target);
    else matched.push({ target, item });
  }
  const missing = targets.filter((t) => !seen.has(t.personId));
  return { matched, failed, missing };
}

export interface IngestSummary {
  enriched: number;
  notFound: number;
  failed: number;
}

/**
 * Reads a finished supreme_coder run's dataset and writes every profile.
 * One provider_calls row for the run (real usageTotalUsd); each person's
 * snapshot links to it. Inputs without a result are `not_found`.
 */
export async function ingestSupremeRun(
  db: SourcingClient,
  run: ApifyRun,
  targets: EnrichmentTarget[],
  ctx: EnrichmentContext,
): Promise<IngestSummary> {
  const succeeded = run.status === "SUCCEEDED";
  const items = run.defaultDatasetId
    ? await getDatasetItems(run.defaultDatasetId)
    : [];
  const callId = await recordProviderCall({
    provider: "apify",
    purpose: "enrich",
    status: !succeeded ? "error" : items.length > 0 ? "ok" : "empty",
    searchRunId: ctx.searchRunId,
    jobId: ctx.jobId,
    userId: ctx.userId,
    providerRequestId: run.id,
    credits: run.chargedEventCounts?.profile ?? null,
    costUsd: run.usageTotalUsd,
    httpStatus: 200,
    error: succeeded ? null : `${run.status}: ${run.statusMessage ?? ""}`,
    request: {
      actor: "supreme_coder~linkedin-profile-scraper",
      urls: targets.map((t) => t.url),
    },
    response: { run: run.raw, items },
  });

  const { matched, failed, missing } = matchItemsToTargets(items, targets);
  let enriched = 0;
  const writeFailed: string[] = [];
  for (const { target, item } of matched) {
    try {
      await writeEnrichedProfile(db, target.personId, mapSupremeItem(item), {
        providerCallId: callId,
        payload: item,
      });
      enriched++;
    } catch (error) {
      log.error("Failed to write enriched profile", {
        error,
        personId: target.personId,
      });
      writeFailed.push(target.personId);
    }
  }
  await markEnrichment(
    db,
    writeFailed,
    "failed",
    "Could not save the enriched profile.",
  );
  await markEnrichment(
    db,
    failed.map((t) => t.personId),
    "not_found",
    "Profile could not be accessed.",
  );
  if (succeeded) {
    await markEnrichment(
      db,
      missing.map((t) => t.personId),
      "not_found",
      "No result returned for this profile.",
    );
  } else {
    await markEnrichment(
      db,
      missing.map((t) => t.personId),
      "failed",
      `Apify run ${run.status}`,
    );
  }
  return {
    enriched,
    notFound: failed.length + (succeeded ? missing.length : 0),
    failed: writeFailed.length + (succeeded ? 0 : missing.length),
  };
}

/** Fallback: one HarvestAPI request per profile, sequentially (free tier = 1 concurrent). */
export async function enrichWithHarvest(
  db: SourcingClient,
  targets: EnrichmentTarget[],
  ctx: EnrichmentContext,
): Promise<IngestSummary> {
  const summary: IngestSummary = { enriched: 0, notFound: 0, failed: 0 };
  for (const target of targets) {
    try {
      const result = await fetchHarvestProfile(target.url);
      const callId = await recordProviderCall({
        provider: "harvestapi",
        purpose: "enrich",
        status: result.profile ? "ok" : "empty",
        searchRunId: ctx.searchRunId,
        jobId: ctx.jobId,
        personId: target.personId,
        userId: ctx.userId,
        providerRequestId: result.requestId,
        credits: result.profile ? 1 : 0,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        httpStatus: result.httpStatus,
        request: { query: target.url },
        response: result.raw,
      });
      if (result.profile) {
        await writeEnrichedProfile(db, target.personId, result.profile, {
          providerCallId: callId,
          payload: (result.raw as { element?: unknown })?.element ?? result.raw,
        });
        summary.enriched++;
      } else {
        await markEnrichment(
          db,
          [target.personId],
          "not_found",
          "Profile not found.",
        );
        summary.notFound++;
      }
    } catch (error) {
      await recordProviderCall({
        provider: "harvestapi",
        purpose: "enrich",
        status: "error",
        searchRunId: ctx.searchRunId,
        jobId: ctx.jobId,
        personId: target.personId,
        userId: ctx.userId,
        error: error instanceof Error ? error.message : String(error),
        request: { query: target.url },
      });
      await markEnrichment(
        db,
        [target.personId],
        "failed",
        "Enrichment request failed.",
      );
      summary.failed++;
    }
  }
  return summary;
}

export {
  markEnrichment,
  writeEnrichedProfile,
  isFresh,
} from "@/lib/enrichment/persist";
