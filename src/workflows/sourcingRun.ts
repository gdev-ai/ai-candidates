import { sleep } from "workflow";

import {
  finalizeStep,
  harvestStep,
  ingestApifyStep,
  markFailedStep,
  markRunning,
  matchStep,
  locationStep,
  planEnrichmentStep,
  pollApifyStep,
  preScoreStep,
  resolveStep,
  searchQueryStep,
  startApifyStep,
  type RunContext,
} from "@/workflows/steps";

const QUERY_CONCURRENCY = 3;
const MATCH_CHUNK = 5;
const HARVEST_CHUNK = 5;
const MAX_APIFY_POLLS = 8;

/**
 * One sourcing run, durable on Vercel Workflows (§5, §8.4):
 * search → resolve people → location check → pre-score → enrich the
 * shortlist (Apify, or HarvestAPI when the monthly credit is low) → AI
 * match → finalize. Started by POST /api/jobs/[id]/search with the run id.
 */
export async function sourcingRunWorkflow(runId: string) {
  "use workflow";

  let ctx: RunContext | null = null;
  try {
    ctx = await markRunning(runId);

    // Search: a few queries at a time.
    const queryErrors: string[] = [];
    let totalHits = 0;
    for (let i = 0; i < ctx.queries.length; i += QUERY_CONCURRENCY) {
      const batch = ctx.queries.slice(i, i + QUERY_CONCURRENCY);
      const results = await Promise.all(batch.map((query) => searchQueryStep(ctx as RunContext, query)));
      for (const result of results) {
        totalHits += result.hits;
        if (result.error) queryErrors.push(result.error);
      }
    }
    if (totalHits === 0 && queryErrors.length > 0) {
      await markFailedStep(runId, queryErrors.join("; "));
      return { status: "error" as const };
    }

    await resolveStep(ctx);
    await locationStep(ctx);
    const shortlist = await preScoreStep(ctx);

    // Enrichment.
    let enriched = 0;
    const plan = await planEnrichmentStep(ctx, shortlist);
    if (plan.targets.length > 0 && plan.route === "apify") {
      const apifyRunId = await startApifyStep(ctx, plan.targets);
      if (apifyRunId) {
        for (let poll = 0; poll < MAX_APIFY_POLLS; poll++) {
          const status = await pollApifyStep(apifyRunId);
          if (status.done) break;
          await sleep("15s");
        }
        enriched += (await ingestApifyStep(ctx, apifyRunId, plan.targets)).enriched;
      }
    } else if (plan.targets.length > 0 && plan.route === "harvestapi") {
      for (let i = 0; i < plan.targets.length; i += HARVEST_CHUNK) {
        enriched += (await harvestStep(ctx, plan.targets.slice(i, i + HARVEST_CHUNK))).enriched;
      }
    }

    // AI match on the shortlist.
    let scored = 0;
    let strongMatches = 0;
    for (let i = 0; i < shortlist.length; i += MATCH_CHUNK) {
      const result = await matchStep(ctx, shortlist.slice(i, i + MATCH_CHUNK));
      scored += result.scored;
      strongMatches += result.strongMatches;
    }

    await finalizeStep(ctx, { queryErrors, enriched, scored, strongMatches });
    return { status: "complete" as const, scored, strongMatches };
  } catch (error) {
    // Details are in the step logs; the run row gets a user-safe message.
    console.error("Sourcing run failed", { runId, error });
    await markFailedStep(runId, "Sourcing run failed unexpectedly. Please try again.");
    return { status: "error" as const };
  }
}
