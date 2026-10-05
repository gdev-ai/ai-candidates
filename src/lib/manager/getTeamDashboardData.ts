import {
  ACTIVITY_FEED_COLUMNS,
  toActivityFeedItems,
  type ActivityFeedItem,
} from "@/lib/activity/feed";
import { resolveDateWindow } from "@/lib/dates/dateRange";
import { hasActiveFilters, type SourcingFileFilters } from "@/lib/manager/filters";
import {
  combinedAverageMatch,
  loadUserStats,
  MEMBER_ROW_COLUMNS,
  pipelineCountsOf,
  statusCount,
  sumStats,
  toMemberRow,
  toUserPerformanceRow,
  type UserPerformanceRow,
  type UserStatsRow,
} from "@/lib/performance/userStats";
import type { SourcingClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database.types";
import { getDisplayName } from "@/lib/users/displayName";

type SourcingFileRpcRow =
  Database["sourcing"]["Functions"]["sourcing_files"]["Returns"][number];

export interface TeamSourcingFileRow {
  runId: string;
  jobId: string;
  jobTitle: string;
  sourcingStatus: string;
  ownerId: string;
  ownerName: string;
  /** Who started this run, when known. */
  startedBy: string | null;
  createdAt: string;
  totalCandidates: number;
  shortlistedCandidates: number;
  unseenCandidates: number;
  averageMatch: number | null;
  lastAccessedBy: string | null;
  /** True when the latest access was by someone other than the file's owner. */
  lastAccessedByOther: boolean;
  lastActivityAt: string | null;
}

export interface TeamSummary {
  id: string;
  name: string;
  managerId: string | null;
}

export interface TeamDashboardData {
  team: TeamSummary;
  totals: {
    members: number;
    activeMembers: number;
    jobs: number;
    activeRuns: number;
    completedRuns: number;
    failedRuns: number;
    candidates: number;
    shortlisted: number;
    contacted: number;
    rejected: number;
    unseen: number;
    averageMatchQuality: number | null;
  };
  pipelineCounts: Record<string, number>;
  members: UserPerformanceRow[];
  sourcingFiles: TeamSourcingFileRow[];
  filtersActive: boolean;
  recentActivity: ActivityFeedItem[];
  loadError: string | null;
}

const MAX_FILES = 200;

/**
 * Sourcing files owned by `ownerIds`, through sourcing.sourcing_files()
 * (SECURITY INVOKER, so RLS still limits it to files the caller may see).
 */
export async function fetchSourcingFiles(
  supabase: SourcingClient,
  ownerIds: string[],
  filters: Partial<SourcingFileFilters>,
  limit = MAX_FILES,
): Promise<{ rows: TeamSourcingFileRow[]; error: boolean }> {
  if (ownerIds.length === 0) return { rows: [], error: false };
  const window = filters.range
    ? resolveDateWindow(filters as SourcingFileFilters)
    : { from: null, to: null };

  const args: Database["sourcing"]["Functions"]["sourcing_files"]["Args"] = {
    p_owner_ids: ownerIds,
    p_limit: limit,
  };
  if (filters.status) args.p_status = filters.status;
  if (filters.jobTitle) args.p_job_title = filters.jobTitle;
  if (window.from) args.p_from = window.from;
  if (window.to) args.p_to = window.to;
  if (filters.minMatch != null) args.p_min_match = filters.minMatch;
  if (filters.minCandidates != null) args.p_min_candidates = filters.minCandidates;

  const { data, error } = await supabase.rpc("sourcing_files", args);
  return { rows: (data ?? []).map(toSourcingFileRow), error: Boolean(error) };
}

export function toSourcingFileRow(row: SourcingFileRpcRow): TeamSourcingFileRow {
  // Generated types mark every column non-null; the left-joined ones aren't.
  const nullable = <T,>(value: T): T | null => value ?? null;
  return {
    runId: row.run_id,
    jobId: row.job_id,
    jobTitle: row.job_title || "Untitled Role",
    sourcingStatus: row.sourcing_status,
    ownerId: row.owner_id,
    ownerName: getDisplayName(nullable(row.owner_email), nullable(row.owner_name)) ?? "Unknown user",
    startedBy: getDisplayName(nullable(row.created_by_email), nullable(row.created_by_name)),
    createdAt: row.created_at,
    totalCandidates: Number(row.total_candidates),
    shortlistedCandidates: Number(row.shortlisted_candidates),
    unseenCandidates: Number(row.unseen_candidates),
    averageMatch: nullable(row.average_match),
    lastAccessedBy: nullable(row.last_accessed_by_id)
      ? (getDisplayName(nullable(row.last_accessed_by_email), nullable(row.last_accessed_by_name)) ??
        "Someone outside your team")
      : null,
    lastAccessedByOther:
      nullable(row.last_accessed_by_id) !== null && row.last_accessed_by_id !== row.owner_id,
    lastActivityAt: nullable(row.last_activity_at),
  };
}

/** Returns null when the caller can't see the team (RLS) or it doesn't exist. */
export async function getTeamDashboardData(
  supabase: SourcingClient,
  teamId: string,
  filters: SourcingFileFilters,
): Promise<TeamDashboardData | null> {
  const [teamRes, membersRes] = await Promise.all([
    supabase.from("teams").select("id, name, manager_id").eq("id", teamId).maybeSingle(),
    supabase
      .from("members")
      .select(MEMBER_ROW_COLUMNS)
      .eq("team_id", teamId)
      .neq("status", "pending"),
  ]);

  const team = teamRes.data;
  if (teamRes.error || !team) return null;

  const teamMembers = (membersRes.data ?? []).map(toMemberRow);
  const memberIds = teamMembers.map((member) => member.user_id);
  const filtersActive = hasActiveFilters(filters);
  // A member filter only ever narrows within the team.
  const fileOwners =
    filters.memberId && memberIds.includes(filters.memberId) ? [filters.memberId] : filters.memberId ? [] : memberIds;

  const [userStats, filesRes, allFilesRes, activityRes] = await Promise.all([
    loadUserStats(supabase, { userIds: memberIds }),
    fetchSourcingFiles(supabase, fileOwners, filters),
    // The Unseen KPI covers the whole team, so it can't come from a filtered list.
    filtersActive ? fetchSourcingFiles(supabase, memberIds, {}, 500) : Promise.resolve(null),
    memberIds.length > 0
      ? supabase
          .from("activity_log")
          .select(ACTIVITY_FEED_COLUMNS)
          .in("user_id", memberIds)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const loadError =
    membersRes.error || userStats.error || filesRes.error || allFilesRes?.error || activityRes.error
      ? "Some team data failed to load. Figures below may be incomplete."
      : null;

  const memberStats = memberIds
    .map((id) => userStats.stats.get(id))
    .filter((row): row is UserStatsRow => row !== undefined);

  const members = teamMembers
    .map((member) =>
      toUserPerformanceRow(
        member,
        userStats.stats.get(member.user_id),
        userStats.signIns.get(member.user_id) ?? null,
        team.name,
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const unseenSource = allFilesRes?.rows ?? filesRes.rows;
  const actors = new Map(teamMembers.map((member) => [member.user_id, member]));

  return {
    team: { id: team.id, name: team.name, managerId: team.manager_id },
    totals: {
      members: teamMembers.length,
      activeMembers: teamMembers.filter((member) => member.status === "active").length,
      jobs: sumStats(memberStats, (row) => row.jobs_count),
      activeRuns: sumStats(memberStats, (row) => row.active_runs),
      completedRuns: sumStats(memberStats, (row) => row.completed_runs),
      failedRuns: sumStats(memberStats, (row) => row.failed_runs),
      candidates: sumStats(memberStats, (row) => row.candidates_count),
      shortlisted: sumStats(memberStats, (row) => statusCount(row, "Shortlisted")),
      contacted: sumStats(memberStats, (row) => statusCount(row, "Contacted")),
      rejected: sumStats(memberStats, (row) => statusCount(row, "Rejected")),
      unseen: unseenSource.reduce((total, row) => total + row.unseenCandidates, 0),
      averageMatchQuality: combinedAverageMatch(memberStats),
    },
    pipelineCounts: pipelineCountsOf(memberStats),
    members,
    sourcingFiles: filesRes.rows,
    filtersActive,
    recentActivity: toActivityFeedItems(activityRes.data ?? [], actors),
    loadError,
  };
}
