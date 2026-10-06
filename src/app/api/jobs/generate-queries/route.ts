import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/api/requireUser";
import { forbidUnlessOwner } from "@/lib/auth/ownership";
import { withErrorHandling } from "@/lib/errors";
import { generateQueriesForJob } from "@/lib/jobs/searchQueries";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const requestSchema = z.object({
  jobId: z.string().uuid("jobId must be a job id."),
});

/**
 * X-ray queries for a job (owner only). The AI picks title synonyms and
 * skill phrases; `site:`, quoting and the location group (job city, else
 * country) are built in code. Queries already run for the job are skipped.
 */
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
  const { jobId } = parsed.data;

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, owner_id")
    .eq("id", jobId)
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: "Failed to load job." }, { status: 500 });
  if (!job)
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const forbidden = forbidUnlessOwner(job.owner_id, user.id, "job");
  if (forbidden) return forbidden;

  const queries = await generateQueriesForJob(supabase, jobId, {
    jobId,
    userId: user.id,
  });

  return NextResponse.json({ queries });
});
