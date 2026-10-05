import { FatalError } from "workflow";

import { logActivity } from "@/lib/activity/log";
import { checkAmbiguousLocations } from "@/lib/candidates/locationCheck";
import { matchCandidates } from "@/lib/candidates/match";
import { preScoreRun } from "@/lib/candidates/preScore";
import { resolvePeopleForRun } from "@/lib/candidates/resolvePeople";
import {
  chooseEnrichmentRoute,
  enrichWithHarvest,
  ingestSupremeRun,
  markEnrichment,
  selectForEnrichment,
  type EnrichmentRoute,
  type EnrichmentTarget,
} from "@/lib/enrichment";
import { ApifyRunLimitError, getApifyRun, startSupremeRun, TERMINAL_STATUSES } from "@/lib/enrichment/apify";
import { createLogger } from "@/lib/logger";
import { recordProviderCall } from "@/lib/providers/callLog";
import { getSearchProvider } from "@/lib/search";
import { runSearchQuery } from "@/lib/search/runSearch";
import { createServiceClient } from "@/lib/supabase/service";
import type { SearchProviderName } from "@/types/search";

/**
 * Durable steps of a sourcing run (docs/db-redesign.md §8.4). Each step
 * takes and returns small serializable values (ids, counts) — payloads stay
 * in Postgres — uses the service-role client filtered by run/job, and only
 * does idempotent writes, so the runtime can retry it.
 */

const log = createLogger("sourcing-workflow");

export interface RunContext {
  runId: string;
  jobId: string;
  userId: string | null;
  jobTitle: string;
  provider: SearchProviderName;
  queries: string[];
  countryCode: string;
  city: string | null;
  startedAt: string;
}

async function heartbeat(runId: string): Promise<void> {
  await createServiceClient()
    .from("search_runs")
    .update({ heartbeat_at: new Date().toISOString() })
    .eq("id", runId);
}

async function logRunActivity(
  ctx: Pick<RunContext, "runId" | "jobId" | "userId" | "jobTitle">,
  action: "sourcing_run.started" | "sourcing_run.completed" | "sourcing_run.failed",
  description: string,
  metadata: Record<string, string | number | null> = {},
): Promise<void> {
  if (!ctx.userId) return;
  const db = createServiceClient();
  // A retried step must not log twice.
  const { data } = await db
    .from("activity_log")
    .select("id")
    .eq("action", action)
    .eq("entity_id", ctx.runId)
    .limit(1);
  if (data && data.length > 0) return;
  await logActivity(db, {
    userId: ctx.userId,
    action,
    entityType: "search_run",
    entityId: ctx.runId,
    description,
    metadata: { jobId: ctx.jobId, ...metadata },
  });
}

export async function markRunning(runId: string): Promise<RunContext> {
  "use step";
  const db = createServiceClient();
  const { data: run, error } = await db
    .from("search_runs")
    .select("id, job_id, created_by, provider, queries, status, started_at, jobs!inner(title, country_code, city)")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  if (!run) throw new FatalError(`Search run ${runId} not found`);
  if (run.status === "cancelled" || run.status === "complete" || run.status === "error") {
    throw new FatalError(`Search run ${runId} is already ${run.status}`);
  }
  const now = new Date().toISOString();
  const startedAt = run.started_at ?? now;
  await db
    .from("search_runs")
    .update({ status: "running", started_at: startedAt, heartbeat_at: now })
    .eq("id", runId);

  const ctx: RunContext = {
    runId,
    jobId: run.job_id,
    userId: run.created_by,
    jobTitle: run.jobs.title,
    provider: run.provider as SearchProviderName,
    queries: run.queries,
    countryCode: run.jobs.country_code,
    city: run.jobs.city,
    startedAt,
  };
  await logRunActivity(ctx, "sourcing_run.started", `Started a sourcing run for "${ctx.jobTitle}"`, {
    queryCount: ctx.queries.length,
    provider: ctx.provider,
  });
  return ctx;
}

export async function searchQueryStep(
  ctx: RunContext,
  query: string,
): Promise<{ hits: number; pages: number; totalResults: number | null; error: string | null }> {
  "use step";
  await heartbeat(ctx.runId);
  return runSearchQuery(createServiceClient(), getSearchProvider(ctx.provider), {
    runId: ctx.runId,
    jobId: ctx.jobId,
    userId: ctx.userId,
    query,
    location: { countryCode: ctx.countryCode, city: ctx.city },
  });
}
// A retry re-bills the search; one retry for transient DB failures only.
searchQueryStep.maxRetries = 1;

export async function resolveStep(ctx: RunContext): Promise<{ found: number; linked: number; newPeople: number }> {
  "use step";
  await heartbeat(ctx.runId);
  const db = createServiceClient();
  const summary = await resolvePeopleForRun(db, {
    runId: ctx.runId,
    jobId: ctx.jobId,
    countryCode: ctx.countryCode,
  });
  let newPeople = 0;
  for (let i = 0; i < summary.personIds.length; i += 200) {
    const { count } = await db
      .from("people")
      .select("id", { count: "exact", head: true })
      .in("id", summary.personIds.slice(i, i + 200))
      .gte("created_at", ctx.startedAt);
    newPeople += count ?? 0;
  }
  await db
    .from("search_runs")
    .update({ candidates_found: summary.linked, candidates_new: newPeople })
    .eq("id", ctx.runId);
  return { found: summary.found, linked: summary.linked, newPeople };
}

export async function locationStep(ctx: RunContext): Promise<{ checked: number; excluded: number }> {
  "use step";
  await heartbeat(ctx.runId);
  const result = await checkAmbiguousLocations(createServiceClient(), {
    runId: ctx.runId,
    jobId: ctx.jobId,
    countryCode: ctx.countryCode,
    userId: ctx.userId,
  });
  return { checked: result.checked, excluded: result.excluded };
}

export async function preScoreStep(ctx: RunContext): Promise<string[]> {
  "use step";
  await heartbeat(ctx.runId);
  const { shortlist } = await preScoreRun(createServiceClient(), {
    runId: ctx.runId,
    jobId: ctx.jobId,
    userId: ctx.userId,
  });
  return shortlist;
}

export async function planEnrichmentStep(
  ctx: RunContext,
  shortlist: string[],
): Promise<{ route: EnrichmentRoute; targets: EnrichmentTarget[]; cached: number }> {
  "use step";
  await heartbeat(ctx.runId);
  const db = createServiceClient();
  const { targets, cached } = await selectForEnrichment(db, shortlist);
  // Mock runs use made-up profile URLs: never send them to a paid provider.
  if (ctx.provider === "mock") return { route: "pending", targets: [], cached: cached.length };
  const { route } = await chooseEnrichmentRoute(targets.length);
  if (route === "pending") {
    await markEnrichment(
      db,
      targets.map((t) => t.personId),
      "pending",
      "Enrichment budget used up for this month; queued.",
    );
  }
  return { route, targets, cached: cached.length };
}

export async function startApifyStep(ctx: RunContext, targets: EnrichmentTarget[]): Promise<string | null> {
  "use step";
  await heartbeat(ctx.runId);
  try {
    const run = await startSupremeRun(targets.map((t) => t.url));
    return run.id;
  } catch (error) {
    log.error("Apify run failed to start", { runId: ctx.runId, error });
    await recordProviderCall({
      provider: "apify",
      purpose: "enrich",
      status: "error",
      searchRunId: ctx.runId,
      jobId: ctx.jobId,
      userId: ctx.userId,
      error: error instanceof Error ? error.message : String(error),
      request: { urls: targets.map((t) => t.url) },
    });
    await markEnrichment(
      createServiceClient(),
      targets.map((t) => t.personId),
      "failed",
      "Enrichment run could not be started.",
    );
    return null;
  }
}
// Never retry a start: a timed-out POST may already have created a billed run.
startApifyStep.maxRetries = 0;

export async function pollApifyStep(apifyRunId: string): Promise<{ done: boolean; limitHit: boolean }> {
  "use step";
  try {
    const run = await getApifyRun(apifyRunId, 50);
    return { done: TERMINAL_STATUSES.has(run.status), limitHit: false };
  } catch (error) {
    if (error instanceof ApifyRunLimitError) {
      log.error("Apify run limit hit — enrichment is blocked until it resets", { apifyRunId, error });
      return { done: true, limitHit: true };
    }
    throw error;
  }
}

export async function ingestApifyStep(
  ctx: RunContext,
  apifyRunId: string,
  targets: EnrichmentTarget[],
): Promise<{ enriched: number; notFound: number; failed: number }> {
  "use step";
  await heartbeat(ctx.runId);
  const run = await getApifyRun(apifyRunId, 0).catch((error: unknown) => {
    if (error instanceof ApifyRunLimitError) return null;
    throw error;
  });
  if (!run) {
    await markEnrichment(
      createServiceClient(),
      targets.map((t) => t.personId),
      "pending",
      "Apify run limit reached; queued.",
    );
    return { enriched: 0, notFound: 0, failed: targets.length };
  }
  return ingestSupremeRun(createServiceClient(), run, targets, {
    searchRunId: ctx.runId,
    jobId: ctx.jobId,
    userId: ctx.userId,
  });
}

export async function harvestStep(
  ctx: RunContext,
  targets: EnrichmentTarget[],
): Promise<{ enriched: number; notFound: number; failed: number }> {
  "use step";
  await heartbeat(ctx.runId);
  return enrichWithHarvest(createServiceClient(), targets, {
    searchRunId: ctx.runId,
    jobId: ctx.jobId,
    userId: ctx.userId,
  });
}
harvestStep.maxRetries = 0;

export async function matchStep(
  ctx: RunContext,
  personIds: string[],
): Promise<{ scored: number; failed: number; strongMatches: number }> {
  "use step";
  await heartbeat(ctx.runId);
  const summary = await matchCandidates(createServiceClient(), {
    jobId: ctx.jobId,
    personIds,
    userId: ctx.userId,
    searchRunId: ctx.runId,
    bulk: true,
    skipScoredSince: ctx.startedAt,
  });
  return { scored: summary.scored, failed: summary.failed, strongMatches: summary.strongMatches };
}

export interface RunOutcome {
  queryErrors: string[];
  enriched: number;
  scored: number;
  strongMatches: number;
}

export async function finalizeStep(ctx: RunContext, outcome: RunOutcome): Promise<void> {
  "use step";
  const db = createServiceClient();
  const [{ count: found }, { count: hits }, { data: calls }] = await Promise.all([
    db
      .from("job_candidates")
      .select("person_id", { count: "exact", head: true })
      .eq("job_id", ctx.jobId)
      .eq("search_run_id", ctx.runId),
    db.from("search_hits").select("id", { count: "exact", head: true }).eq("search_run_id", ctx.runId),
    db.from("provider_calls").select("cost_usd").eq("search_run_id", ctx.runId),
  ]);
  const cost = (calls ?? []).reduce((sum, c) => sum + Number(c.cost_usd ?? 0), 0);
  await db
    .from("search_runs")
    .update({
      status: "complete",
      candidates_found: found ?? 0,
      total_results: hits ?? 0,
      cost_usd: Math.round(cost * 10_000) / 10_000,
      error: outcome.queryErrors.length ? outcome.queryErrors.join("; ").slice(0, 2000) : null,
      completed_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
    })
    .eq("id", ctx.runId)
    .in("status", ["pending", "running"]);
  await logRunActivity(
    ctx,
    "sourcing_run.completed",
    `Completed a sourcing run for "${ctx.jobTitle}" (${found ?? 0} candidates, ${outcome.strongMatches} strong ${outcome.strongMatches === 1 ? "match" : "matches"})`,
    {
      candidatesFound: found ?? 0,
      enriched: outcome.enriched,
      scored: outcome.scored,
      strongMatches: outcome.strongMatches,
    },
  );
}

export async function markFailedStep(runId: string, message: string): Promise<void> {
  "use step";
  const db = createServiceClient();
  const { data: run } = await db
    .from("search_runs")
    .select("id, job_id, created_by, jobs!inner(title)")
    .eq("id", runId)
    .maybeSingle();
  await db
    .from("search_runs")
    .update({ status: "error", error: message.slice(0, 2000), completed_at: new Date().toISOString() })
    .eq("id", runId)
    .in("status", ["pending", "running"]);
  if (run) {
    await logRunActivity(
      { runId, jobId: run.job_id, userId: run.created_by, jobTitle: run.jobs.title },
      "sourcing_run.failed",
      `Had a sourcing run fail for "${run.jobs.title}"`,
    );
  }
}
