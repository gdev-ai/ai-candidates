import { scoreCandidate } from "@/lib/ai/prompts/candidate-matching";
import { mapWithConcurrency } from "@/lib/candidates/locationCheck";
import { createLogger } from "@/lib/logger";
import type { Row, SourcingClient } from "@/lib/supabase/types";
import type { Json } from "@/types/database.types";
import type { RequirementKind } from "@/types/job-analysis";
import { MATCH_WEIGHTS, STRONG_MATCH_THRESHOLD, type MatchingJob, type MatchingPerson } from "@/types/matching";

const log = createLogger("match");
const CONCURRENCY = 3;

export async function loadMatchingJob(db: SourcingClient, jobId: string): Promise<MatchingJob | null> {
  const { data, error } = await db
    .from("jobs")
    .select(
      "id, title, description, seniority, employment_type, work_arrangement, city, country_code, min_experience, max_experience, job_requirements(id, kind, text, weight, sort_order)",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const requirements = [...data.job_requirements]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.sort_order - b.sort_order)
    .map((r) => ({ id: r.id, kind: r.kind as RequirementKind, text: r.text, weight: Number(r.weight) }));
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    seniority: data.seniority,
    employment_type: data.employment_type,
    work_arrangement: data.work_arrangement,
    city: data.city,
    country_code: data.country_code,
    min_experience: data.min_experience === null ? null : Number(data.min_experience),
    max_experience: data.max_experience === null ? null : Number(data.max_experience),
    requirements,
  };
}

/**
 * A person with every child table. Exa's partial rows are used only when no
 * full-enrichment rows exist.
 */
export async function loadMatchingPerson(db: SourcingClient, personId: string): Promise<MatchingPerson | null> {
  const { data, error } = await db
    .from("people")
    .select(
      `id, full_name, headline, about, search_snippet, current_title, current_company, location_text, country_code,
       location_verified, experience_years, enrichment_status,
       person_experiences(title, company, location, start_year, start_month, end_year, end_month, is_current, description, sort_order, source),
       person_education(school, degree, field_of_study, start_year, end_year, sort_order, source),
       person_skills(name, endorsements, is_top),
       person_certifications(title, issuer, issued_on),
       person_languages(name, proficiency)`,
    )
    .eq("id", personId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const preferFull = <T extends { source: string; sort_order: number }>(rows: T[]): T[] => {
    const full = rows.filter((r) => r.source !== "exa");
    return (full.length ? full : rows).sort((a, b) => a.sort_order - b.sort_order);
  };
  return {
    id: data.id,
    full_name: data.full_name,
    headline: data.headline,
    about: data.about,
    search_snippet: data.search_snippet,
    current_title: data.current_title,
    current_company: data.current_company,
    location_text: data.location_text,
    country_code: data.country_code,
    location_verified: data.location_verified,
    experience_years: data.experience_years === null ? null : Number(data.experience_years),
    enriched: data.enrichment_status === "enriched",
    experiences: preferFull(data.person_experiences),
    education: preferFull(data.person_education),
    skills: [...data.person_skills].sort(
      (a, b) => Number(b.is_top) - Number(a.is_top) || (b.endorsements ?? 0) - (a.endorsements ?? 0),
    ),
    certifications: data.person_certifications,
    languages: data.person_languages,
  };
}

export interface MatchSummary {
  scored: number;
  failed: number;
  strongMatches: number;
  matches: Row<"match_results">[];
}

/**
 * Scores people against a job: inserts an append-only match_results row
 * per person and points job_candidates.latest_match_id / match_score /
 * scored_at at it. One person's failure never stops the rest. Use the
 * service client (match_results is server-write only) after checking
 * ownership. `skipScoredSince` makes a retried workflow step skip people
 * it already scored.
 */
export async function matchCandidates(
  db: SourcingClient,
  input: {
    jobId: string;
    personIds: string[];
    userId: string | null;
    searchRunId?: string | null;
    bulk?: boolean;
    skipScoredSince?: string | null;
  },
): Promise<MatchSummary> {
  const job = await loadMatchingJob(db, input.jobId);
  if (!job) throw new Error(`Job ${input.jobId} not found`);

  let personIds = input.personIds;
  if (input.skipScoredSince && personIds.length) {
    const { data } = await db
      .from("job_candidates")
      .select("person_id")
      .eq("job_id", input.jobId)
      .in("person_id", personIds)
      .gte("scored_at", input.skipScoredSince);
    const done = new Set((data ?? []).map((r) => r.person_id));
    personIds = personIds.filter((id) => !done.has(id));
  }

  const matches: Row<"match_results">[] = [];
  let failed = 0;
  await mapWithConcurrency(personIds, CONCURRENCY, async (personId) => {
    try {
      const person = await loadMatchingPerson(db, personId);
      if (!person) throw new Error("person not found");
      const scored = await scoreCandidate(job, person, {
        bulk: input.bulk,
        context: { jobId: job.id, personId, searchRunId: input.searchRunId ?? null, userId: input.userId },
      });
      const { data: match, error } = await db
        .from("match_results")
        .insert({
          job_id: job.id,
          person_id: personId,
          provider_call_id: scored.callId,
          model: scored.model,
          prompt_version: scored.promptVersion,
          match_score: scored.match_score,
          skills_score: scored.skills_score,
          experience_score: scored.experience_score,
          location_score: scored.location_score,
          education_score: scored.education_score,
          seniority_score: scored.seniority_score,
          weights: MATCH_WEIGHTS as unknown as Json,
          summary: scored.summary,
          items: scored.items as unknown as Json,
        })
        .select()
        .single();
      if (error) throw error;
      const { error: linkError } = await db
        .from("job_candidates")
        .update({ latest_match_id: match.id, match_score: match.match_score, scored_at: match.created_at })
        .eq("job_id", job.id)
        .eq("person_id", personId);
      if (linkError) throw linkError;
      matches.push(match);
    } catch (error) {
      failed++;
      log.warn("Failed to score candidate", { jobId: job.id, personId, error });
    }
  });

  return {
    scored: matches.length,
    failed,
    strongMatches: matches.filter((m) => Number(m.match_score) >= STRONG_MATCH_THRESHOLD).length,
    matches,
  };
}
