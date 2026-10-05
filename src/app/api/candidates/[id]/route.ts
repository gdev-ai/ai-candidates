import { NextResponse } from "next/server";

import { loadPipelineRow } from "@/app/api/candidates/[id]/_lib/pipeline";
import { logActivity } from "@/lib/activity/log";
import { requireUser } from "@/lib/api/requireUser";
import { describeOwnership, forbidUnlessOwner } from "@/lib/auth/ownership";
import { withErrorHandling } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { getDisplayName } from "@/lib/users/displayName";
import type {
  CandidateDetailResponse,
  MatchItem,
  MatchResultRecord,
  PersonProfile,
} from "@/types/candidate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const log = createLogger("api-candidate");

const PERSON_COLUMNS =
  "id, full_name, first_name, last_name, headline, about, search_snippet, current_title, current_company, location_text, city, country_code, location_verified, location_evidence, experience_years, open_to_work, hiring, premium, verified, connections_count, followers_count, photo_url, profile_url, enrichment_status, enriched_at";

/**
 * GET /api/candidates/[personId]?jobId=… — the global profile plus this
 * job's pipeline state, match history and notes. Opening it marks the
 * candidate as seen by the caller for this job.
 */
export const GET = withErrorHandling(async (request: Request, { params }: RouteParams) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: personId } = await params;

  const resolved = await loadPipelineRow(supabase, request, personId);
  if ("error" in resolved) return resolved.error;
  const { row } = resolved;
  const jobId = row.job_id;

  const [person, experiences, education, skills, certifications, languages, matches, notes, ownership] =
    await Promise.all([
      supabase.from("people").select(PERSON_COLUMNS).eq("id", personId).single(),
      supabase
        .from("person_experiences")
        .select(
          "id, title, company, location, employment_type, workplace_type, start_year, start_month, end_year, end_month, is_current, description, skills, duration_text",
        )
        .eq("person_id", personId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("person_education")
        .select("id, school, degree, field_of_study, start_year, end_year, description")
        .eq("person_id", personId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("person_skills")
        .select("name, endorsements, is_top, source")
        .eq("person_id", personId)
        .order("is_top", { ascending: false })
        .order("endorsements", { ascending: false, nullsFirst: false })
        .order("name", { ascending: true }),
      supabase
        .from("person_certifications")
        .select("id, title, issuer, credential_url, issued_on, expires_on")
        .eq("person_id", personId)
        .order("issued_on", { ascending: false, nullsFirst: false }),
      supabase.from("person_languages").select("id, name, proficiency").eq("person_id", personId),
      supabase
        .from("match_results")
        .select(
          "id, match_score, skills_score, experience_score, location_score, education_score, seniority_score, summary, items, weights, model, prompt_version, created_at",
        )
        .eq("job_id", jobId)
        .eq("person_id", personId)
        .order("created_at", { ascending: false }),
      supabase
        .from("candidate_notes")
        .select("id, note, created_at, author_id, author:members!candidate_notes_author_id_fkey ( email, full_name )")
        .eq("job_id", jobId)
        .eq("person_id", personId)
        .order("created_at", { ascending: false }),
      describeOwnership(supabase, row.owner_id, user.id),
    ]);

  if (person.error || !person.data) {
    log.error("Failed to load person", { error: person.error });
    return NextResponse.json({ error: "Failed to load candidate." }, { status: 500 });
  }
  const childError =
    experiences.error ?? education.error ?? skills.error ?? certifications.error ?? languages.error ?? matches.error ?? notes.error;
  if (childError) {
    log.error("Failed to load candidate details", { error: childError });
    return NextResponse.json({ error: "Failed to load candidate." }, { status: 500 });
  }

  // Best-effort "seen" marker for the dashboard's unseen counts; keeps the
  // first view time, and never blocks loading the profile.
  const { error: viewError } = await supabase
    .from("candidate_views")
    .upsert(
      { user_id: user.id, job_id: jobId, person_id: personId },
      { onConflict: "user_id,job_id,person_id", ignoreDuplicates: true },
    );
  if (viewError) log.warn("Failed to record candidate view", { error: viewError });

  const body: CandidateDetailResponse = {
    person: person.data as PersonProfile,
    experiences: (experiences.data ?? []).map((e) => ({ ...e, skills: e.skills ?? [] })),
    education: education.data ?? [],
    skills: skills.data ?? [],
    certifications: certifications.data ?? [],
    languages: languages.data ?? [],
    pipeline: {
      job_id: row.job_id,
      job_title: row.job_title,
      status: row.status,
      status_changed_at: row.status_changed_at,
      found_at: row.found_at,
      match_score: row.match_score,
      scored_at: row.scored_at,
    },
    matches: (matches.data ?? []).map(
      (m): MatchResultRecord => ({
        ...m,
        items: Array.isArray(m.items) ? (m.items as MatchItem[]) : [],
      }),
    ),
    notes: (notes.data ?? []).map((n) => ({
      id: n.id,
      note: n.note,
      created_at: n.created_at,
      author_id: n.author_id,
      author_name: n.author ? getDisplayName(n.author.email, n.author.full_name) : null,
    })),
    ...ownership,
  };

  return NextResponse.json(body);
});

/**
 * DELETE /api/candidates/[personId]?jobId=… — removes the person from this
 * job's pipeline (owner only). The global profile stays; this job's
 * matches, notes and views cascade.
 */
export const DELETE = withErrorHandling(async (request: Request, { params }: RouteParams) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: personId } = await params;

  const resolved = await loadPipelineRow(supabase, request, personId);
  if ("error" in resolved) return resolved.error;
  const { row } = resolved;

  const forbidden = forbidUnlessOwner(row.owner_id, user.id, "candidate list");
  if (forbidden) return forbidden;

  const { data, error } = await supabase
    .from("job_candidates")
    .delete()
    .eq("job_id", row.job_id)
    .eq("person_id", personId)
    .select("person_id")
    .maybeSingle();

  if (error) {
    log.error("Failed to remove candidate from job", { error });
    return NextResponse.json({ error: "Failed to remove candidate." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Candidate not found for this job." }, { status: 404 });

  await logActivity(supabase, {
    userId: user.id,
    action: "candidate.deleted",
    entityType: "candidate",
    entityId: personId,
    description: `Removed ${row.person_name ?? "a candidate"} from "${row.job_title}"`,
    metadata: { jobId: row.job_id },
  });

  return NextResponse.json({ success: true });
});
