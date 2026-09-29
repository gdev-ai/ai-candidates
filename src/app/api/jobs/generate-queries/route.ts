import { NextResponse } from "next/server";
import { z } from "zod";

import { getAIProvider } from "@/lib/ai";
import { generateSearchQueries } from "@/lib/ai/prompts/search-query-generation";
import { requireUser } from "@/lib/api/requireUser";
import { resolveCleanLocationText } from "@/lib/candidates/locationBias";
import { withErrorHandling } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { jobAnalysisSchema } from "@/types/job-analysis";

// job_id is optional: it's only known when regenerating queries for a job
// that already exists (the New Job flow generates queries before the job
// itself is created, so it has no history to pass here). When present, it
// scopes the "don't repeat past queries" lookup below to this job only.
const requestSchema = jobAnalysisSchema.extend({
  job_id: z.string().uuid().optional(),
});

export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  await enforceRateLimit(
    `ai:${auth.user.id}`,
    RATE_LIMITS.aiRequest.limit,
    RATE_LIMITS.aiRequest.windowSeconds,
  );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid job analysis data." },
      { status: 400 },
    );
  }
  const { job_id: jobId, ...jobAnalysis } = parsed.data;

  let previousQueries: string[] = [];
  if (jobId) {
    const { data, error } = await supabase
      .from("search_queries")
      .select("query")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    if (error) {
      return NextResponse.json(
        { error: "Failed to load this job's previous search queries." },
        { status: 500 },
      );
    }
    previousQueries = (data ?? []).map((row) => row.query as string);
  }

  // A raw location value straight from a recruiter can be a list of cities
  // or other non-canonical text ("Egypt; Cairo, Giza, Mansoura, Alex").
  // Quoting that verbatim as a literal search phrase asks Google to match
  // text no real profile will ever contain — confirmed live to make Google
  // silently drop the query's actual constraints and return unrelated
  // noise instead of erroring. Clean it the same way the SerpApi location
  // param is cleaned (see resolveCleanLocationText) before it ever reaches
  // the prompt.

  
  // const cleanedJobAnalysis = {
  //   ...jobAnalysis,
  //   location: resolveCleanLocationText(jobAnalysis.location) ?? "",
  // };

const DEFAULT_LOCATION = "Cairo OR Giza OR Mansoura OR Alexandria";

const cleanedLocation =
  resolveCleanLocationText(jobAnalysis.location)?.trim();

const finalLocation = cleanedLocation || DEFAULT_LOCATION;

const cleanedJobAnalysis = {
  ...jobAnalysis,
  location: finalLocation,
};

  const provider = getAIProvider();
  const queries = await generateSearchQueries(cleanedJobAnalysis, provider, previousQueries);
  return NextResponse.json({ search_queries: queries });
});
