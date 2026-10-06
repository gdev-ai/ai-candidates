import type { SourcingClient } from "@/lib/supabase/types";
import type { JobCandidateListItem, MatchSummary } from "@/types/candidate";

/**
 * One query: the job's pipeline rows with the global person, their skills
 * and the latest match (via job_candidates.latest_match_id). Explicit
 * columns only — people/raw payload columns stay out of list reads.
 */
const JOB_CANDIDATE_SELECT = `
  job_id, person_id, search_run_id, status, status_changed_at, found_at, pre_score, match_score, scored_at,
  run:search_runs!job_candidates_search_run_id_fkey ( job_version_id ),
  person:people!job_candidates_person_id_fkey (
    full_name, headline, current_title, current_company, location_text, city,
    location_verified, photo_url, profile_url, open_to_work, experience_years, enrichment_status,
    person_skills ( name, is_top, endorsements )
  ),
  latest_match:match_results!job_candidates_latest_match_id_fkey (
    id, match_score, skills_score, experience_score, location_score, education_score,
    seniority_score, summary, created_at
  )
`;

interface SkillRow {
  name: string;
  is_top: boolean;
  endorsements: number | null;
}

/** Top skills first, then by endorsements, then name. */
export function orderSkills(skills: SkillRow[]): string[] {
  return [...skills]
    .sort(
      (a, b) =>
        Number(b.is_top) - Number(a.is_top) ||
        (b.endorsements ?? -1) - (a.endorsements ?? -1) ||
        a.name.localeCompare(b.name),
    )
    .map((s) => s.name);
}

export async function loadJobCandidates(
  supabase: SourcingClient,
  jobId: string,
  userId: string,
): Promise<{ data: JobCandidateListItem[]; error: unknown }> {
  const [rowsResult, viewsResult, versionsResult] = await Promise.all([
    supabase
      .from("job_candidates")
      .select(JOB_CANDIDATE_SELECT)
      .eq("job_id", jobId),
    supabase
      .from("candidate_views")
      .select("person_id")
      .eq("job_id", jobId)
      .eq("user_id", userId),
    supabase.from("job_versions").select("id, version").eq("job_id", jobId),
  ]);

  if (rowsResult.error) return { data: [], error: rowsResult.error };
  const viewed = new Set((viewsResult.data ?? []).map((v) => v.person_id));
  const versionNumber = new Map(
    (versionsResult.data ?? []).map((v) => [v.id, v.version]),
  );

  const data = (rowsResult.data ?? []).map((row): JobCandidateListItem => {
    const person = row.person;
    const match = row.latest_match as MatchSummary | null;
    return {
      job_id: row.job_id,
      person_id: row.person_id,
      search_run_id: row.search_run_id,
      job_version_id: row.run?.job_version_id ?? null,
      version: row.run?.job_version_id
        ? (versionNumber.get(row.run.job_version_id) ?? null)
        : null,
      name: person?.full_name ?? null,
      headline: person?.headline ?? null,
      current_title: person?.current_title ?? null,
      current_company: person?.current_company ?? null,
      location: person?.location_text ?? person?.city ?? null,
      location_verified: person?.location_verified ?? null,
      photo_url: person?.photo_url ?? null,
      profile_url: person?.profile_url ?? null,
      open_to_work: person?.open_to_work ?? null,
      experience_years: person?.experience_years ?? null,
      enrichment_status: person?.enrichment_status ?? "none",
      skills: orderSkills(person?.person_skills ?? []),
      status: row.status,
      status_changed_at: row.status_changed_at,
      found_at: row.found_at,
      pre_score: row.pre_score,
      match_score: row.match_score ?? match?.match_score ?? null,
      scored_at: row.scored_at,
      match,
      viewed: viewed.has(row.person_id),
    };
  });

  return { data, error: null };
}

/** Loads a visible job's owner (RLS: 404 when the caller can't see it). */
export async function loadJobOwner(
  supabase: SourcingClient,
  jobId: string,
): Promise<{
  job: { id: string; owner_id: string; title: string } | null;
  error: unknown;
}> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, owner_id, title")
    .eq("id", jobId)
    .maybeSingle();
  return { job: data, error };
}
