import { NextResponse } from "next/server";

import { loadCandidatesForJobs } from "@/app/api/jobs/_lib/candidates";
import { requireUser } from "@/lib/api/requireUser";
import {
  filterCandidates,
  parseCandidateQuery,
  sortCandidates,
} from "@/lib/candidates/filterAndSort";
import { withErrorHandling } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import type { CandidateListItem } from "@/types/candidate";

const log = createLogger("api-candidates");

/**
 * Every candidate across the caller's own jobs (one row per job + person),
 * filtered, sorted and paged like GET /api/jobs/[id]/candidates. Also
 * returns those jobs so the page can offer a job filter.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (jobsError) {
    log.error("Failed to load jobs", { error: jobsError });
    return NextResponse.json(
      { error: "Failed to load candidates." },
      { status: 500 },
    );
  }

  const jobTitles = new Map((jobs ?? []).map((j) => [j.id, j.title]));
  const { data, error } = await loadCandidatesForJobs(
    supabase,
    [...jobTitles.keys()],
    user.id,
  );
  if (error) {
    log.error("Failed to load candidates", { error });
    return NextResponse.json(
      { error: "Failed to load candidates." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(
    1,
    Math.floor(Number(searchParams.get("page") ?? "1")) || 1,
  );
  const limit = Math.min(
    100,
    Math.max(1, Math.floor(Number(searchParams.get("limit") ?? "20")) || 20),
  );
  const { filters, sortBy, sortDir } = parseCandidateQuery(searchParams);

  const sorted = sortCandidates(
    filterCandidates(data, filters),
    sortBy,
    sortDir,
  );
  const from = (page - 1) * limit;
  const candidates: CandidateListItem[] = sorted
    .slice(from, from + limit)
    .map((c) => ({ ...c, job_title: jobTitles.get(c.job_id) ?? "" }));

  return NextResponse.json({
    candidates,
    total: sorted.length,
    jobs: jobs ?? [],
    page,
    limit,
  });
});
