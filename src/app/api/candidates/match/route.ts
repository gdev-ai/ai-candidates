import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/api/requireUser";
import { forbidUnlessOwner } from "@/lib/auth/ownership";
import { matchCandidates } from "@/lib/candidates/match";
import { withErrorHandling } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";

const requestSchema = z.object({
  jobId: z.string().uuid("jobId must be a job id."),
  personId: z.string().uuid("personId must be a person id."),
});

/** Rescores one candidate for a job (owner only). Returns the new match_results row. */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  await enforceRateLimit(
    `ai:${user.id}`,
    RATE_LIMITS.aiRequest.limit,
    RATE_LIMITS.aiRequest.windowSeconds,
  );

  const body: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { jobId, personId } = parsed.data;

  const [{ data: job, error: jobError }, { data: link, error: linkError }] =
    await Promise.all([
      supabase
        .from("jobs")
        .select("id, owner_id")
        .eq("id", jobId)
        .maybeSingle(),
      supabase
        .from("job_candidates")
        .select("person_id")
        .eq("job_id", jobId)
        .eq("person_id", personId)
        .maybeSingle(),
    ]);
  if (jobError || linkError) {
    return NextResponse.json(
      { error: "Failed to load job or candidate." },
      { status: 500 },
    );
  }
  if (!job)
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const forbidden = forbidUnlessOwner(job.owner_id, user.id, "job");
  if (forbidden) return forbidden;
  if (!link)
    return NextResponse.json(
      { error: "This candidate is not on this job." },
      { status: 404 },
    );

  const summary = await matchCandidates(createServiceClient(), {
    jobId,
    personIds: [personId],
    userId: user.id,
  });
  const match = summary.matches[0];
  if (!match) {
    return NextResponse.json(
      { error: "Failed to score this candidate. Please try again." },
      { status: 502 },
    );
  }
  return NextResponse.json({ match });
});
