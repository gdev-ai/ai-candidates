import { generateSearchQueries } from "@/lib/ai/prompts/search-query-generation";
import type { CallContext } from "@/lib/ai/structured";
import type { SourcingClient } from "@/lib/supabase/types";
import { jobAnalysisSchema } from "@/types/job-analysis";

/**
 * New X-ray queries for a job: AI-picked titles/skills built into queries
 * in code, skipping every query already run for the job plus `exclude`
 * (queries of a run that are not saved yet). Used by the generate-queries
 * route and by the sourcing workflow when a run comes back short.
 */
export async function generateQueriesForJob(
  db: SourcingClient,
  jobId: string,
  context: CallContext,
  exclude: string[] = [],
): Promise<string[]> {
  const { data: job, error } = await db
    .from("jobs")
    .select(
      "id, title, seniority, city, country_code, job_requirements(kind, text, sort_order)",
    )
    .eq("id", jobId)
    .single();
  if (error) throw error;

  const [{ data: analyses }, { data: runs }] = await Promise.all([
    db
      .from("job_analyses")
      .select("output")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1),
    db.from("search_runs").select("queries").eq("job_id", jobId),
  ]);

  const analysis = jobAnalysisSchema.partial().safeParse(analyses?.[0]?.output);
  const requirements = [...job.job_requirements].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const byKind = (kind: string) =>
    requirements.filter((r) => r.kind === kind).map((r) => r.text);

  const { queries } = await generateSearchQueries(
    {
      title: job.title,
      seniority: job.seniority,
      alternativeTitles: analysis.success
        ? (analysis.data.search_keywords ?? [])
        : [],
      requiredSkills: byKind("skill_required"),
      preferredSkills: byKind("skill_preferred"),
      keywords: byKind("keyword"),
      previousQueries: [...(runs ?? []).flatMap((r) => r.queries), ...exclude],
    },
    { countryCode: job.country_code, city: job.city },
    context,
  );
  return queries;
}
