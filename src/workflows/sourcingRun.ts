import { sleep } from "workflow";

import {
  finalizeScoreStep,
  finalizeStep,
  harvestStep,
  ingestApifyStep,
  markFailedStep,
  markRunning,
  moreQueriesStep,
  matchStep,
  planEnrichmentStep,
  pollApifyStep,
  preScoreStep,
  resolveStep,
  searchQueryStep,
  startApifyStep,
  dropIneligibleStep,
  type RunContext,
} from "@/workflows/steps";
import { CANDIDATES_PER_RUN } from "@/types/job";

const QUERY_CONCURRENCY = 3;
const MATCH_CHUNK = 5;
/** Match chunks scored at the same time (each chunk runs 3 calls in parallel). */
const MATCH_PARALLEL_CHUNKS = 3;
/** Above this many, matching uses the cheaper but slower flex tier. */
const FLEX_THRESHOLD = 25;
const HARVEST_CHUNK = 3;
/** Poll Apify every 5s for up to 2 minutes. */
const MAX_APIFY_POLLS = 24;
/** Aim for this many in-country people per kept candidate before picking. */
const POOL_FACTOR = 1.5;
const MAX_TOP_UP_ROUNDS = 2;

/**
 * One sourcing run, durable on Vercel Workflows (§5, §8.4):
 * search → resolve people (searching more if too few) → pre-score → enrich the
 * shortlist (Apify, or HarvestAPI when the monthly credit is low) → AI
 * match → finalize. Started by POST /api/jobs/[id]/search with the run id
 * and how many candidates to AI-score; the other in-country people found
 * stay on the job unscored. Each step writes search_runs.stage for the
 * loading screen.
 */
export async function sourcingRunWorkflow(
  runId: string,
  maxCandidates: number = CANDIDATES_PER_RUN,
) {
  "use workflow";

  let ctx: RunContext | null = null;
  try {
    ctx = await markRunning(runId);

    // Search: a few queries at a time.
    const queryErrors: string[] = [];
    let totalHits = 0;
    const runQueries = async (queries: string[]) => {
      for (let i = 0; i < queries.length; i += QUERY_CONCURRENCY) {
        const batch = queries.slice(i, i + QUERY_CONCURRENCY);
        const results = await Promise.all(
          batch.map((query) => searchQueryStep(ctx as RunContext, query)),
        );
        for (const result of results) {
          totalHits += result.hits;
          if (result.error) queryErrors.push(result.error);
        }
      }
    };
    await runQueries(ctx.queries);
    if (totalHits === 0 && queryErrors.length > 0) {
      await markFailedStep(runId, queryErrors.join("; "));
      return { status: "error" as const };
    }

    // Too few in-country people for a good pick: search more, a bounded
    // number of times. Resolving again is idempotent.
    let { linked } = await resolveStep(ctx);
    const used = [...ctx.queries];
    const target = Math.ceil(maxCandidates * POOL_FACTOR);
    for (let round = 0; round < MAX_TOP_UP_ROUNDS && linked < target; round++) {
      const extra = await moreQueriesStep(ctx, used);
      if (extra.length === 0) break;
      used.push(...extra);
      await runQueries(extra);
      ({ linked } = await resolveStep(ctx));
    }

    // AI location check paused: resolveStep links only people whose
    // location is confirmed in-country, so there is nothing left to check.
    const shortlist = await preScoreStep(ctx, maxCandidates);

    const enriched = await enrichPeople(ctx, shortlist);
    const { scored, strongMatches } = await scorePeople(ctx, shortlist);

    // Everyone in-country stays on the job, scored or not; only people
    // abroad or at our own company are removed.
    await dropIneligibleStep(ctx);

    await finalizeStep(ctx, { queryErrors, enriched, scored, strongMatches });
    return { status: "complete" as const, scored, strongMatches };
  } catch (error) {
    // Details are in the step logs; the run row gets a user-safe message.
    console.error("Sourcing run failed", { runId, error });
    await markFailedStep(
      runId,
      "Sourcing run failed unexpectedly. Please try again.",
    );
    return { status: "error" as const };
  }
}

/**
 * Reads full profiles for these people (Apify, or HarvestAPI when the
 * monthly credit is low; people with a fresh profile are skipped).
 */
async function enrichPeople(
  ctx: RunContext,
  personIds: string[],
): Promise<number> {
  let enriched = 0;
  const plan = await planEnrichmentStep(ctx, personIds);
  if (plan.targets.length > 0 && plan.route === "apify") {
    const apifyRunId = await startApifyStep(ctx, plan.targets);
    if (apifyRunId) {
      for (let poll = 0; poll < MAX_APIFY_POLLS; poll++) {
        const status = await pollApifyStep(apifyRunId);
        if (status.done) break;
        await sleep("5s");
      }
      enriched += (await ingestApifyStep(ctx, apifyRunId, plan.targets))
        .enriched;
    }
  } else if (plan.targets.length > 0 && plan.route === "harvestapi") {
    // Chunks run in parallel. More parallelism doesn't help: HarvestAPI
    // slows each request (~10s -> ~22s) when 13 arrive at once.
    const chunks: (typeof plan.targets)[] = [];
    for (let i = 0; i < plan.targets.length; i += HARVEST_CHUNK) {
      chunks.push(plan.targets.slice(i, i + HARVEST_CHUNK));
    }
    const results = await Promise.all(
      chunks.map((chunk) => harvestStep(ctx, chunk)),
    );
    for (const result of results) enriched += result.enriched;
  }
  return enriched;
}

/** AI-scores these people against the job, a few chunks at a time. */
async function scorePeople(
  ctx: RunContext,
  personIds: string[],
): Promise<{ scored: number; strongMatches: number }> {
  let scored = 0;
  let strongMatches = 0;
  const bulk = personIds.length > FLEX_THRESHOLD;
  const chunks: string[][] = [];
  for (let i = 0; i < personIds.length; i += MATCH_CHUNK)
    chunks.push(personIds.slice(i, i + MATCH_CHUNK));
  for (let i = 0; i < chunks.length; i += MATCH_PARALLEL_CHUNKS) {
    const results = await Promise.all(
      chunks
        .slice(i, i + MATCH_PARALLEL_CHUNKS)
        .map((chunk) => matchStep(ctx, chunk, bulk)),
    );
    for (const result of results) {
      scored += result.scored;
      strongMatches += result.strongMatches;
    }
  }
  return { scored, strongMatches };
}

/**
 * A scoring batch ("Score 10 more" / "Score selected"): reads and AI-scores
 * up to 10 people already on the job, against its current version. No web
 * search. Started by POST /api/jobs/[id]/score; progress via the same
 * status route as a search.
 */
export async function scoreBatchWorkflow(runId: string) {
  "use workflow";

  try {
    const ctx = await markRunning(runId);
    const enriched = await enrichPeople(ctx, ctx.targetPersonIds);
    const { scored, strongMatches } = await scorePeople(
      ctx,
      ctx.targetPersonIds,
    );
    await finalizeScoreStep(ctx, { enriched, scored, strongMatches });
    return { status: "complete" as const, scored, strongMatches };
  } catch (error) {
    console.error("Scoring batch failed", { runId, error });
    await markFailedStep(
      runId,
      "Scoring failed unexpectedly. Please try again.",
    );
    return { status: "error" as const };
  }
}
