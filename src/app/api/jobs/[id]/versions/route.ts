import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";
import { readSnapshot, type JobVersionSummary } from "@/lib/jobs/versions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/jobs/[id]/versions → { versions } oldest first: each version's
 * snapshot (read-only), its searches, and how many candidates it found and
 * how many of those are scored. Visible to anyone who can see the job.
 */
export const GET = withErrorHandling(
  async (_request: Request, { params }: RouteParams) => {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { supabase } = auth;
    const { id: jobId } = await params;

    const [versionsResult, runsResult, linksResult] = await Promise.all([
      supabase
        .from("job_versions")
        .select("id, version, created_at, snapshot, created_by")
        .eq("job_id", jobId)
        .order("version"),
      supabase
        .from("search_runs")
        .select(
          "id, job_version_id, kind, status, created_at, queries, candidates_found",
        )
        .eq("job_id", jobId)
        .order("created_at"),
      supabase
        .from("job_candidates")
        .select("search_run_id, match_score")
        .eq("job_id", jobId),
    ]);
    if (versionsResult.error || runsResult.error || linksResult.error) {
      return NextResponse.json(
        { error: "Failed to load the job's versions." },
        { status: 500 },
      );
    }

    const creatorIds = [
      ...new Set(
        (versionsResult.data ?? [])
          .map((v) => v.created_by)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const { data: members } = creatorIds.length
      ? await supabase
          .from("members")
          .select("user_id, full_name, email")
          .in("user_id", creatorIds)
      : { data: [] };
    const names = new Map(
      (members ?? []).map((m) => [m.user_id, m.full_name || m.email]),
    );

    const runs = runsResult.data ?? [];
    const versionOfRun = new Map(runs.map((r) => [r.id, r.job_version_id]));
    const counts = new Map<string, { candidates: number; scored: number }>();
    for (const link of linksResult.data ?? []) {
      const versionId = link.search_run_id
        ? versionOfRun.get(link.search_run_id)
        : null;
      if (!versionId) continue;
      const c = counts.get(versionId) ?? { candidates: 0, scored: 0 };
      c.candidates++;
      if (link.match_score !== null) c.scored++;
      counts.set(versionId, c);
    }

    const versions: JobVersionSummary[] = (versionsResult.data ?? []).map(
      (v) => ({
        id: v.id,
        version: v.version,
        created_at: v.created_at,
        created_by_name: v.created_by
          ? (names.get(v.created_by) ?? null)
          : null,
        snapshot: readSnapshot(v.snapshot),
        candidates: counts.get(v.id)?.candidates ?? 0,
        scored: counts.get(v.id)?.scored ?? 0,
        searches: runs
          .filter((r) => r.job_version_id === v.id && r.kind === "search")
          .map((r) => ({
            id: r.id,
            status: r.status,
            created_at: r.created_at,
            queries: r.queries,
            candidates_found: r.candidates_found,
          })),
      }),
    );

    return NextResponse.json({ versions });
  },
);
