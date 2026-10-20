import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";

/** A finished run older than this is never announced (e.g. a stale `since`). */
const MAX_LOOKBACK_MS = 60 * 60 * 1000;

export interface WatchedRun {
  id: string;
  jobId: string;
  jobTitle: string;
  kind: string;
  status: string;
  candidatesFound: number;
  candidatesScored: number | null;
  completedAt: string | null;
}

/**
 * GET ?since=ISO: the caller's own searches and scoring batches that are
 * still running, plus those that finished after `since`. Polled by the
 * SearchRunWatcher in the nav so a finished search is announced on any
 * page. `now` is the server clock, to pass back as the next `since`.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const now = new Date();
  const floor = now.getTime() - MAX_LOOKBACK_MS;
  const param = new URL(request.url).searchParams.get("since");
  const parsed = param ? Date.parse(param) : NaN;
  const since = new Date(
    Number.isFinite(parsed) ? Math.max(parsed, floor) : now.getTime(),
  ).toISOString();

  const { data, error } = await supabase
    .from("search_runs")
    .select(
      "id, job_id, kind, status, candidates_found, candidates_scored, completed_at, jobs(title)",
    )
    .eq("created_by", user.id)
    .or(
      `status.in.(pending,running),and(status.in.(complete,error),completed_at.gte.${since})`,
    )
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    return NextResponse.json(
      { error: "Failed to load your searches." },
      { status: 500 },
    );
  }

  const runs: WatchedRun[] = (data ?? []).map((run) => {
    const job = run.jobs as { title: string } | { title: string }[] | null;
    const title = Array.isArray(job) ? job[0]?.title : job?.title;
    return {
      id: run.id,
      jobId: run.job_id,
      jobTitle: title ?? "your job",
      kind: run.kind,
      status: run.status,
      candidatesFound: run.candidates_found,
      candidatesScored: run.candidates_scored,
      completedAt: run.completed_at,
    };
  });

  return NextResponse.json({
    now: now.toISOString(),
    running: runs.filter(
      (r) => r.status === "pending" || r.status === "running",
    ),
    finished: runs.filter(
      (r) => r.status === "complete" || r.status === "error",
    ),
  });
});
