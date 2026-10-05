import { NextResponse } from "next/server";
import { z } from "zod";

import type { SourcingClient } from "@/lib/supabase/types";

export interface PipelineRow {
  job_id: string;
  person_id: string;
  status: string;
  status_changed_at: string | null;
  found_at: string;
  match_score: number | null;
  scored_at: string | null;
  job_title: string;
  owner_id: string;
  person_name: string | null;
}

const uuid = z.uuid();

/**
 * Resolves the (job, person) pair a candidate route acts on. The person id
 * is the route param; the job comes from `?jobId=` — every candidate
 * screen is per job, since status, match and notes live on the pair.
 * Returns a ready error response when the pair is invalid or not visible.
 */
export async function loadPipelineRow(
  supabase: SourcingClient,
  request: Request,
  personId: string,
): Promise<{ row: PipelineRow } | { error: NextResponse }> {
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId || !uuid.safeParse(jobId).success) {
    return { error: NextResponse.json({ error: "A valid jobId query parameter is required." }, { status: 400 }) };
  }
  if (!uuid.safeParse(personId).success) {
    return { error: NextResponse.json({ error: "Candidate not found." }, { status: 404 }) };
  }

  const { data, error } = await supabase
    .from("job_candidates")
    .select(
      `job_id, person_id, status, status_changed_at, found_at, match_score, scored_at,
       job:jobs!job_candidates_job_id_fkey ( owner_id, title ),
       person:people!job_candidates_person_id_fkey ( full_name )`,
    )
    .eq("job_id", jobId)
    .eq("person_id", personId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: "Failed to load candidate." }, { status: 500 }) };
  }
  // RLS: a pair on a job the caller can't see reads as not found.
  if (!data || !data.job) {
    return { error: NextResponse.json({ error: "Candidate not found for this job." }, { status: 404 }) };
  }

  return {
    row: {
      job_id: data.job_id,
      person_id: data.person_id,
      status: data.status,
      status_changed_at: data.status_changed_at,
      found_at: data.found_at,
      match_score: data.match_score,
      scored_at: data.scored_at,
      job_title: data.job.title,
      owner_id: data.job.owner_id,
      person_name: data.person?.full_name ?? null,
    },
  };
}
