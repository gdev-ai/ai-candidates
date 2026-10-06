import { NextResponse } from "next/server";

import {
  loadJobCandidates,
  loadJobOwner,
} from "@/app/api/jobs/_lib/candidates";
import { requireUser } from "@/lib/api/requireUser";
import {
  filterCandidates,
  parseCandidateQuery,
  sortCandidates,
} from "@/lib/candidates/filterAndSort";
import { withErrorHandling } from "@/lib/errors";
import { createLogger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const log = createLogger("api-job-candidates");

/**
 * A job's pipeline: job_candidates + person + skills + latest match.
 * Filtered, sorted and paged in memory so the three stay consistent; fine
 * at this app's per-job volumes (tens to a few hundred people).
 */
export const GET = withErrorHandling(
  async (request: Request, { params }: RouteParams) => {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { supabase, user } = auth;
    const { id: jobId } = await params;

    const { job, error: jobError } = await loadJobOwner(supabase, jobId);
    if (jobError)
      return NextResponse.json(
        { error: "Failed to load job." },
        { status: 500 },
      );
    if (!job)
      return NextResponse.json({ error: "Job not found." }, { status: 404 });

    const { data, error } = await loadJobCandidates(supabase, jobId, user.id);
    if (error) {
      log.error("Failed to load job candidates", { error });
      return NextResponse.json(
        { error: "Failed to load candidates for this job." },
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

    // Unscored people in the run / version being viewed (other filters
    // aside): what "Score 10 more" picks from.
    const unscored = filterCandidates(data, {
      runId: filters.runId,
      versionId: filters.versionId,
    }).filter((c) => c.match_score === null).length;

    return NextResponse.json({
      candidates: sorted.slice(from, from + limit),
      total: sorted.length,
      totalInJob: data.length,
      unscored,
      page,
      limit,
    });
  },
);
