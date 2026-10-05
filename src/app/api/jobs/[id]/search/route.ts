import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/api/requireUser";
import { forbidUnlessOwner } from "@/lib/auth/ownership";
import { withErrorHandling } from "@/lib/errors";
import { startSourcingRun } from "@/lib/jobs/queue";
import { createLogger, getOrCreateRequestId } from "@/lib/logger";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { configuredSearchProvider } from "@/lib/search";

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
 * workflow. Progress: GET /api/search/[runId]/status.
 */
export const POST = withErrorHandling(async (request: Request, { params }: RouteParams) => {
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
  if (jobError) return NextResponse.json({ error: "Failed to load job." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const forbidden = forbidUnlessOwner(job.owner_id, user.id, "job");
  if (forbidden) return forbidden;

  const { data: run, error: runError } = await supabase
    .from("search_runs")
    .insert({
      job_id: jobId,
      created_by: user.id,
      provider: configuredSearchProvider(),
      queries,
      status: "pending",
    })
    .select("id, status")
    .single();
  if (runError || !run) {
    log.error("Failed to create search run", { jobId, error: runError });
    return NextResponse.json({ error: "Failed to start search run." }, { status: 500 });
  }

  try {
    const workflowRunId = await startSourcingRun(run.id);
    await supabase.from("search_runs").update({ workflow_run_id: workflowRunId }).eq("id", run.id);
  } catch (error) {
    log.error("Failed to start sourcing workflow", { jobId, runId: run.id, error });
    await supabase
      .from("search_runs")
      .update({
        status: "error",
        error: "Could not start the search.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return NextResponse.json({ error: "Failed to start search run." }, { status: 500 });
  }

  return NextResponse.json({ run: { id: run.id, status: run.status } }, { status: 202 });
});
