import {
  ACTIVITY_FEED_COLUMNS,
  toActivityFeedItems,
  type ActivityFeedItem,
} from "@/lib/activity/feed";
import type { Role } from "@/lib/auth/roleDefinitions";
import {
  combinedAverageMatch,
  loadUserStats,
  MEMBER_ROW_COLUMNS,
  memberDisplayName,
  pipelineCountsOf,
  statusCount,
  sumStats,
  toMemberRow,
  toUserPerformanceRow,
  type UserPerformanceRow,
  type UserStatsRow,
} from "@/lib/performance/userStats";
import type { SourcingClient } from "@/lib/supabase/types";

export interface AdminTeamRow {
  id: string;
  name: string;
  managerId: string | null;
  members: number;
  activeMembers: number;
  jobs: number;
  activeRuns: number;
  candidates: number;
  shortlisted: number;
  averageMatchQuality: number | null;
}

export interface AccessRequest {
  id: string;
  email: string;
  name: string;
  requestedAt: string;
}

export interface PendingInvite {
  email: string;
  role: Role;
  teamName: string | null;
  invitedAt: string;
}

export interface AdminDashboardData {
  totals: {
    users: number;
    activeUsers: number;
    teams: number;
    jobs: number;
    activeRuns: number;
    completedRuns: number;
    failedRuns: number;
    candidates: number;
    shortlisted: number;
    contacted: number;
    rejected: number;
    averageMatchQuality: number | null;
  };
  pipelineCounts: Record<string, number>;
  /** Active and disabled members (pending ones are access requests). */
  users: UserPerformanceRow[];
  teams: AdminTeamRow[];
  teamOptions: { id: string; name: string }[];
  managerOptions: { id: string; name: string }[];
  recentActivity: ActivityFeedItem[];
  /** People who signed in without an invite (members.status = pending). */
  accessRequests: AccessRequest[];
  pendingInvites: PendingInvite[];
  loadError: string | null;
}

/** Admin-only view; RLS gives an admin every members/teams/invites/activity row. */
export async function getAdminDashboardData(supabase: SourcingClient): Promise<AdminDashboardData> {
  const [userStats, membersRes, teamsRes, activityRes, invitesRes] = await Promise.all([
    loadUserStats(supabase),
    supabase.from("members").select(MEMBER_ROW_COLUMNS).order("email"),
    supabase.from("teams").select("id, name, manager_id").order("name"),
    supabase
      .from("activity_log")
      .select(ACTIVITY_FEED_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("invites")
      .select("email, role, team_id, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const loadError =
    userStats.error || membersRes.error || teamsRes.error || activityRes.error || invitesRes.error
      ? "Some admin data failed to load. Figures below may be incomplete."
      : null;

  const { stats, signIns } = userStats;
  const allMembers = (membersRes.data ?? []).map(toMemberRow);
  const members = allMembers.filter((member) => member.status !== "pending");
  const requests = allMembers
    .filter((member) => member.status === "pending")
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  const teams = teamsRes.data ?? [];
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const actors = new Map(allMembers.map((member) => [member.user_id, member]));

  const users = members
    .map((member) =>
      toUserPerformanceRow(
        member,
        stats.get(member.user_id),
        signIns.get(member.user_id) ?? null,
        member.team_id ? (teamNames.get(member.team_id) ?? null) : null,
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const statsOf = (ids: string[]) =>
    ids.map((id) => stats.get(id)).filter((row): row is UserStatsRow => row !== undefined);
  const allStats = statsOf(members.map((member) => member.user_id));

  const teamRows: AdminTeamRow[] = teams.map((team) => {
    const teamMembers = members.filter((member) => member.team_id === team.id);
    const memberStats = statsOf(teamMembers.map((member) => member.user_id));
    return {
      id: team.id,
      name: team.name,
      managerId: team.manager_id,
      members: teamMembers.length,
      activeMembers: teamMembers.filter((member) => member.status === "active").length,
      jobs: sumStats(memberStats, (row) => row.jobs_count),
      activeRuns: sumStats(memberStats, (row) => row.active_runs),
      candidates: sumStats(memberStats, (row) => row.candidates_count),
      shortlisted: sumStats(memberStats, (row) => statusCount(row, "Shortlisted")),
      averageMatchQuality: combinedAverageMatch(memberStats),
    };
  });

  return {
    totals: {
      users: members.length,
      activeUsers: members.filter((member) => member.status === "active").length,
      teams: teams.length,
      jobs: sumStats(allStats, (row) => row.jobs_count),
      activeRuns: sumStats(allStats, (row) => row.active_runs),
      completedRuns: sumStats(allStats, (row) => row.completed_runs),
      failedRuns: sumStats(allStats, (row) => row.failed_runs),
      candidates: sumStats(allStats, (row) => row.candidates_count),
      shortlisted: sumStats(allStats, (row) => statusCount(row, "Shortlisted")),
      contacted: sumStats(allStats, (row) => statusCount(row, "Contacted")),
      rejected: sumStats(allStats, (row) => statusCount(row, "Rejected")),
      averageMatchQuality: combinedAverageMatch(allStats),
    },
    pipelineCounts: pipelineCountsOf(allStats),
    users,
    teams: teamRows,
    teamOptions: teams.map((team) => ({ id: team.id, name: team.name })),
    managerOptions: users
      .filter((user) => user.role === "hr_manager" && user.isActive)
      .map((user) => ({ id: user.id, name: user.name })),
    recentActivity: toActivityFeedItems(activityRes.data ?? [], actors),
    accessRequests: requests.map((member) => ({
      id: member.user_id,
      email: member.email,
      name: memberDisplayName(member),
      requestedAt: member.requested_at,
    })),
    pendingInvites: (invitesRes.data ?? []).map((invite) => ({
      email: invite.email,
      role: invite.role as Role,
      teamName: invite.team_id ? (teamNames.get(invite.team_id) ?? null) : null,
      invitedAt: invite.created_at,
    })),
    loadError,
  };
}
