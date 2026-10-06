import {
  ACTIVITY_FEED_COLUMNS,
  toActivityFeedItems,
  type ActivityFeedItem,
} from "@/lib/activity/feed";
import { fetchSourcingFiles, type TeamSourcingFileRow } from "@/lib/manager/getTeamDashboardData";
import {
  loadUserStats,
  MEMBER_ROW_COLUMNS,
  pipelineCountsOf,
  toMemberRow,
  toUserPerformanceRow,
  type UserPerformanceRow,
} from "@/lib/performance/userStats";
import type { SourcingClient } from "@/lib/supabase/types";

export interface RecentlyOpenedFile {
  runId: string;
  jobId: string;
  jobTitle: string;
  accessedAt: string;
}

export interface TeamMemberData {
  member: UserPerformanceRow;
  pipelineCounts: Record<string, number>;
  files: TeamSourcingFileRow[];
  recentlyOpened: RecentlyOpenedFile[];
  recentActivity: ActivityFeedItem[];
  loadError: string | null;
}

/**
 * Returns null when the member isn't visible to the caller — RLS on
 * `members` (visible_owner_ids) only exposes the team a manager leads (and
 * everyone to an admin), so an out-of-team id looks the same as a missing one.
 */
export async function getTeamMemberData(
  supabase: SourcingClient,
  memberId: string,
): Promise<TeamMemberData | null> {
  const { data: row, error: memberError } = await supabase
    .from("members")
    .select(`${MEMBER_ROW_COLUMNS}, teams!members_team_id_fkey(name)`)
    .eq("user_id", memberId)
    .maybeSingle();

  if (memberError || !row) return null;
  const member = toMemberRow(row);

  const [userStats, filesRes, accessRes, activityRes] = await Promise.all([
    loadUserStats(supabase, { userIds: [memberId] }),
    fetchSourcingFiles(supabase, [memberId], {}, 50),
    supabase
      .from("search_run_access")
      .select("search_run_id, last_accessed_at, search_runs(job_id, jobs(title))")
      .eq("user_id", memberId)
      .order("last_accessed_at", { ascending: false })
      .limit(8),
    supabase
      .from("activity_log")
      .select(ACTIVITY_FEED_COLUMNS)
      .eq("user_id", memberId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const loadError =
    userStats.error || filesRes.error || accessRes.error || activityRes.error
      ? "Some of this member's data failed to load. Figures below may be incomplete."
      : null;

  const stats = userStats.stats.get(memberId);

  // One row per (run, user); runs the caller can't see come back without a join.
  const recentlyOpened: RecentlyOpenedFile[] = (accessRes.data ?? []).flatMap((access) =>
    access.search_runs
      ? [
          {
            runId: access.search_run_id,
            jobId: access.search_runs.job_id,
            jobTitle: access.search_runs.jobs?.title ?? "Untitled Role",
            accessedAt: access.last_accessed_at,
          },
        ]
      : [],
  );

  return {
    member: toUserPerformanceRow(
      member,
      stats,
      userStats.signIns.get(memberId) ?? null,
      row.teams?.name ?? null,
    ),
    pipelineCounts: pipelineCountsOf(stats ? [stats] : []),
    files: filesRes.rows,
    recentlyOpened,
    recentActivity: toActivityFeedItems(activityRes.data ?? [], new Map([[member.user_id, member]])),
    loadError,
  };
}
