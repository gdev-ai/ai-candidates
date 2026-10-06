import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/api/requireUser";
import { forbidUnlessOwner } from "@/lib/auth/ownership";
import { withErrorHandling } from "@/lib/errors";
import { checkCredits, launchRun } from "@/lib/jobs/launchRun";
import { startScoreBatch } from "@/lib/jobs/queue";
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
  /** Score these people (already on the job). Omit for the next unscored. */
  personIds: z
    .array(z.string().uuid())
    .min(1)
    .max(
      CANDIDATES_PER_RUN,
      `Select at most ${CANDIDATES_PER_RUN} candidates to score at once.`,
    )
    .optional(),
  /** With no personIds: pick from this version's candidates only. */
  versionId: z.string().uuid().optional(),
});

/**
 * POST /api/jobs/[id]/score (owner only): starts a scoring batch that reads
 * and AI-scores up to 10 people already on the job, against its current
 * version, without a new web search. Either the selected people or the
 * next most promising unscored ones (by pre-score). Uses one search credit.
 */
export const POST = withErrorHandling(
  async (request: Request, { params }: RouteParams) => {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { supabase, user } = auth;
    const { id: jobId } = await params;
    const log = createLogger(getOrCreateRequestId(request));

    await enforceRateLimit(
      `score:${user.id}`,
      RATE_LIMITS.searchRequest.limit,
      RATE_LIMITS.searchRequest.windowSeconds,
    );

    const parsed = requestSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

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

    // People an unfinished batch is already scoring.
    const { data: active } = await supabase
      .from("search_runs")
      .select("target_person_ids")
      .eq("job_id", jobId)
      .eq("kind", "score")
      .in("status", ["pending", "running"]);
    const busy = new Set(
      (active ?? []).flatMap((r) => r.target_person_ids ?? []),
    );

    let personIds: string[];
    if (parsed.data.personIds) {
      const requested = [...new Set(parsed.data.personIds)];
      if (requested.some((id) => busy.has(id))) {
        return NextResponse.json(
          { error: "Some of these candidates are already being scored." },
          { status: 409 },
        );
      }
      const { data: links, error } = await supabase
        .from("job_candidates")
        .select("person_id")
        .eq("job_id", jobId)
        .in("person_id", requested);
      if (error)
        return NextResponse.json(
          { error: "Failed to load candidates." },
          { status: 500 },
        );
      if ((links ?? []).length !== requested.length) {
        return NextResponse.json(
          { error: "Some selected candidates aren't on this job." },
          { status: 400 },
        );
      }
      personIds = requested;
    } else {
      let query = supabase
        .from("job_candidates")
        .select("person_id")
        .eq("job_id", jobId)
        .is("match_score", null)
        .order("pre_score", { ascending: false, nullsFirst: false })
        .order("found_at", { ascending: false })
        .limit(CANDIDATES_PER_RUN + busy.size);
      if (parsed.data.versionId) {
        const { data: runs } = await supabase
          .from("search_runs")
          .select("id")
          .eq("job_id", jobId)
          .eq("job_version_id", parsed.data.versionId);
        query = query.in(
          "search_run_id",
          (runs ?? []).map((r) => r.id),
        );
      }
      const { data, error } = await query;
      if (error)
        return NextResponse.json(
          { error: "Failed to load candidates." },
          { status: 500 },
        );
      personIds = (data ?? [])
        .map((r) => r.person_id)
        .filter((id) => !busy.has(id))
        .slice(0, CANDIDATES_PER_RUN);
      if (personIds.length === 0) {
        return NextResponse.json(
          { error: "Everyone here is already scored." },
          { status: 400 },
        );
      }
    }

    const guard = await checkCredits();
    if ("response" in guard) return guard.response;

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
        kind: "score",
        provider: configuredSearchProvider(),
        queries: [],
        max_candidates: personIds.length,
        target_person_ids: personIds,
        job_version_id: version.id,
      },
      (runId) => startScoreBatch(runId),
      log,
    );
  },
);

/**
 * GET /api/jobs/[id]/score → { run } — the job's unfinished scoring batch,
 * if any, so a reloaded page can pick its progress back up.
 */
export const GET = withErrorHandling(
  async (_request: Request, { params }: RouteParams) => {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { id: jobId } = await params;
    const { data } = await auth.supabase
      .from("search_runs")
      .select("id, target_person_ids")
      .eq("job_id", jobId)
      .eq("kind", "score")
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({
      run: data
        ? { id: data.id, personIds: data.target_person_ids ?? [] }
        : null,
    });
  },
);
