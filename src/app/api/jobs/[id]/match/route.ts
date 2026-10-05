import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity/log";
import { requireUser } from "@/lib/api/requireUser";
import { forbidUnlessOwner } from "@/lib/auth/ownership";
import { matchCandidates } from "@/lib/candidates/match";
import { withErrorHandling } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { STRONG_MATCH_THRESHOLD } from "@/types/matching";

export const maxDuration = 300;

/** Cost/time guard per request; best-ranked candidates first. */
const MAX_CANDIDATES = 100;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** (Re)scores the job's candidates (owner only); each score is a new match_results row. */
export const POST = withErrorHandling(async (_request: Request, { params }: RouteParams) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: jobId } = await params;

  await enforceRateLimit(
    `ai:${user.id}`,
    RATE_LIMITS.aiRequest.limit,
    RATE_LIMITS.aiRequest.windowSeconds,
  );

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, owner_id, title")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Failed to load job." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const forbidden = forbidUnlessOwner(job.owner_id, user.id, "job");
  if (forbidden) return forbidden;

  const { data: links, error: linkError } = await supabase
    .from("job_candidates")
    .select("person_id")
    .eq("job_id", jobId)
    .order("match_score", { ascending: false, nullsFirst: false })
    .order("pre_score", { ascending: false, nullsFirst: false })
    .limit(MAX_CANDIDATES);
  if (linkError) {
    return NextResponse.json({ error: "Failed to load candidates for this job." }, { status: 500 });
  }
  const personIds = (links ?? []).map((l) => l.person_id);
  if (personIds.length === 0) return NextResponse.json({ scored: 0, failed: 0, strongMatches: 0 });

  // match_results is server-write only; ownership was checked above.
  const summary = await matchCandidates(createServiceClient(), { jobId, personIds, userId: user.id });

  if (summary.scored > 0) {
    // strongMatches > 0 also notifies the owner's manager (DB trigger).
    await logActivity(supabase, {
      userId: user.id,
      action: "job.candidates_scored",
      entityType: "job",
      entityId: jobId,
      description: `Scored ${summary.scored} candidates for "${job.title}" — ${summary.strongMatches} strong ${summary.strongMatches === 1 ? "match" : "matches"} (${STRONG_MATCH_THRESHOLD}%+)`,
      metadata: {
        jobId,
        scored: summary.scored,
        strongMatches: summary.strongMatches,
        threshold: STRONG_MATCH_THRESHOLD,
      },
    });
  }

  return NextResponse.json({
    scored: summary.scored,
    failed: summary.failed,
    strongMatches: summary.strongMatches,
  });
});
