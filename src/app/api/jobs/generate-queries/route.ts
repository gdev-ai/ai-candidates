import { NextResponse } from "next/server";
import { z } from "zod";

import { generateSearchQueries } from "@/lib/ai/prompts/search-query-generation";
import { requireUser } from "@/lib/api/requireUser";
import { forbidUnlessOwner } from "@/lib/auth/ownership";
import { withErrorHandling } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { jobAnalysisSchema } from "@/types/job-analysis";

const requestSchema = z.object({ jobId: z.string().uuid("jobId must be a job id.") });

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
    .select("id, owner_id, title, seniority, city, country_code, job_requirements(kind, text, sort_order)")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Failed to load job." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const forbidden = forbidUnlessOwner(job.owner_id, user.id, "job");
  if (forbidden) return forbidden;

  const [{ data: analyses }, { data: runs }] = await Promise.all([
    supabase
      .from("job_analyses")
      .select("output")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("search_runs").select("queries").eq("job_id", jobId),
  ]);
  const analysis = jobAnalysisSchema.partial().safeParse(analyses?.[0]?.output);
  const requirements = [...job.job_requirements].sort((a, b) => a.sort_order - b.sort_order);
  const byKind = (kind: string) => requirements.filter((r) => r.kind === kind).map((r) => r.text);

  const { queries } = await generateSearchQueries(
    {
      title: job.title,
      seniority: job.seniority,
      alternativeTitles: analysis.success ? (analysis.data.search_keywords ?? []) : [],
      requiredSkills: byKind("skill_required"),
      preferredSkills: byKind("skill_preferred"),
      keywords: byKind("keyword"),
      previousQueries: (runs ?? []).flatMap((r) => r.queries),
    },
    { countryCode: job.country_code, city: job.city },
    { jobId, userId: user.id },
  );
  return NextResponse.json({ queries });
});
