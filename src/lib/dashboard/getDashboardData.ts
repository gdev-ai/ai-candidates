import { toSourcingFileRow } from "@/lib/manager/getTeamDashboardData";
import {
  averageOf,
  pipelineCountsOf,
  statusCount,
  toUserStatsRow,
} from "@/lib/performance/userStats";
import type { SourcingClient } from "@/lib/supabase/types";

export interface UnifiedSourcingRow {
  runId: string;
  jobId: string;
  jobTitle: string;
  sourcingStatus: string;
  totalCandidates: number;
  shortlistedCandidates: number;
  unseenCandidates: number;
  averageMatch: number | null;
  fileCreatedBy: string | null;
  lastAccessedBy: string | null;
  lastActivityTime: string | null;
  createdAt: string;
}

export interface TodaysCandidateRow {
  personId: string;
  jobId: string;
  name: string | null;
  headline: string | null;
  jobTitle: string | null;
  matchScore: number | null;
  foundAt: string;
}

export interface ScoreBucket {
  label: string;
  count: number;
}

export interface DashboardData {
  totalJobs: number;
  totalCandidates: number;
  shortlistedCandidates: number;
  averageMatchQuality: number | null;
  pipelineCounts: Record<string, number>;
  unifiedRows: UnifiedSourcingRow[];
  scoreBuckets: ScoreBucket[];
  scoredCandidates: number;
  todaysCandidatesCount: number;
  todaysCandidates: TodaysCandidateRow[];
  loadError: string | null;
}

/** Match-score buckets: (min, max] except the first, which includes 0. */
export const SCORE_BUCKETS = [
  { label: "0–20", min: null, max: 20 },
  { label: "21–40", min: 20, max: 40 },
  { label: "41–60", min: 40, max: 60 },
  { label: "61–80", min: 60, max: 80 },
  { label: "81–100", min: 80, max: 100 },
] as const;

const RECENT_FILES = 20;
const TODAYS_LIST = 8;

/**
 * The personal dashboard for every role: only the caller's own work (jobs
 * they own), even for managers and admins whose RLS would allow more —
 * team and org views live at /manager and /admin. Every query is either an
 * aggregate (RPC / head count) or explicitly limited.
 */
export async function getDashboardData(
  supabase: SourcingClient,
  currentUserId: string,
): Promise<DashboardData> {
  const startOfTodayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  // Head-count of the caller's job_candidates matching a score range.
  const scoreCount = (min: number | null, max: number) => {
    let query = supabase
      .from("job_candidates")
      .select("job_id, jobs!inner(owner_id)", { count: "exact", head: true })
      .eq("jobs.owner_id", currentUserId)
      .lte("match_score", max);
    query = min === null ? query.gte("match_score", 0) : query.gt("match_score", min);
    return query;
  };

  const [statsRes, filesRes, todaysCountRes, todaysRes, ...bucketRes] = await Promise.all([
    supabase.rpc("user_performance_stats", { p_user_ids: [currentUserId] }),
    supabase.rpc("sourcing_files", { p_owner_ids: [currentUserId], p_limit: RECENT_FILES }),
    supabase
      .from("job_candidates")
      .select("job_id, jobs!inner(owner_id)", { count: "exact", head: true })
      .eq("jobs.owner_id", currentUserId)
      .gte("found_at", startOfTodayIso),
    supabase
      .from("job_candidates")
      .select(
        "job_id, person_id, match_score, found_at, jobs!inner(title, owner_id), people(full_name, headline, current_title)",
      )
      .eq("jobs.owner_id", currentUserId)
      .gte("found_at", startOfTodayIso)
      .order("found_at", { ascending: false })
      .limit(TODAYS_LIST),
    ...SCORE_BUCKETS.map((bucket) => scoreCount(bucket.min, bucket.max)),
  ]);

  const loadError =
    statsRes.error ||
    filesRes.error ||
    todaysCountRes.error ||
    todaysRes.error ||
    bucketRes.some((res) => res.error)
      ? "Some dashboard data failed to load. Try refreshing the page."
      : null;

  const statsRow = statsRes.data?.find((row) => row.user_id === currentUserId);
  const stats = statsRow ? toUserStatsRow(statsRow) : undefined;

  const unifiedRows: UnifiedSourcingRow[] = (filesRes.data ?? []).map((raw) => {
    const file = toSourcingFileRow(raw);
    return {
      runId: file.runId,
      jobId: file.jobId,
      jobTitle: file.jobTitle,
      sourcingStatus: file.sourcingStatus,
      totalCandidates: file.totalCandidates,
      shortlistedCandidates: file.shortlistedCandidates,
      unseenCandidates: file.unseenCandidates,
      averageMatch: file.averageMatch,
      fileCreatedBy: file.startedBy,
      lastAccessedBy: file.lastAccessedBy,
      lastActivityTime: file.lastActivityAt,
      createdAt: file.createdAt,
    };
  });

  const scoreBuckets = SCORE_BUCKETS.map((bucket, i) => ({
    label: bucket.label,
    count: bucketRes[i]?.count ?? 0,
  }));

  const todaysCandidates: TodaysCandidateRow[] = (todaysRes.data ?? []).map((row) => ({
    personId: row.person_id,
    jobId: row.job_id,
    name: row.people?.full_name ?? null,
    headline: row.people?.headline ?? row.people?.current_title ?? null,
    jobTitle: row.jobs?.title ?? null,
    matchScore: row.match_score,
    foundAt: row.found_at,
  }));

  return {
    totalJobs: stats?.jobs_count ?? 0,
    totalCandidates: stats?.candidates_count ?? 0,
    shortlistedCandidates: statusCount(stats, "Shortlisted"),
    // Average of per-file (run) averages, so a big file doesn't outweigh small ones.
    averageMatchQuality: averageOf(stats?.run_avg_sum ?? 0, stats?.run_avg_count ?? 0),
    pipelineCounts: pipelineCountsOf(stats ? [stats] : []),
    unifiedRows,
    scoreBuckets,
    scoredCandidates: scoreBuckets.reduce((total, bucket) => total + bucket.count, 0),
    todaysCandidatesCount: todaysCountRes.count ?? 0,
    todaysCandidates,
    loadError,
  };
}
