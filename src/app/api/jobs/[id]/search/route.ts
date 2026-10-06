import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/api/requireUser";
import { forbidUnlessOwner } from "@/lib/auth/ownership";
import { withErrorHandling } from "@/lib/errors";
import { checkCredits, launchRun } from "@/lib/jobs/launchRun";
import { startSourcingRun } from "@/lib/jobs/queue";
import { ensureJobVersion } from "@/lib/jobs/versionsServer";
import { createLogger, getOrCreateRequestId } from "@/lib/logger";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { configuredSearchProvider } from "@/lib/search";
import { createServiceClient } from "@/lib/supabase/service";
import { CANDIDATES_PER_RUN } from "@/types/job";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const requestSchema = z.object({
  queries: z
    .array(z.string().trim().min(1).max(400))
    .min(1, "At least one search query is required.")
    .max(10, "At most 10 queries per run."),
});

/**
 * Creates the search_runs row (owner only) and starts the durable sourcing
 * workflow. Every run scores CANDIDATES_PER_RUN; a client-sent size is
 * ignored. Progress: GET /api/search/[runId]/status.
 */
export const POST = withErrorHandling(
  async (request: Request, { params }: RouteParams) => {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { supabase, user } = auth;
    const { id: jobId } = await params;
    const log = createLogger(getOrCreateRequestId(request));

    await enforceRateLimit(
      `search:${user.id}`,
      RATE_LIMITS.searchRequest.limit,
      RATE_LIMITS.searchRequest.windowSeconds,
    );

    const body: unknown = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }
    const queries = [...new Set(parsed.data.queries)];

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, owner_id")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError)
      return NextResponse.json(
        { error: "Failed to load job." },
        { status: 500 },
      );
    if (!job)
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    const forbidden = forbidUnlessOwner(job.owner_id, user.id, "job");
    if (forbidden) return forbidden;

    // Search limits are shared by everyone on these API keys.
    const guard = await checkCredits();
    if ("response" in guard) return guard.response;

    // The version this search runs as (new if the details changed).
    const version = await ensureJobVersion(
      createServiceClient(),
      jobId,
      user.id,
    );

    return launchRun(
      supabase,
      guard.credits,
      {
        job_id: jobId,
        created_by: user.id,
        provider: configuredSearchProvider(),
        queries,
        max_candidates: CANDIDATES_PER_RUN,
        job_version_id: version.id,
      },
      (runId) => startSourcingRun(runId, CANDIDATES_PER_RUN),
      log,
    );
  },
);
