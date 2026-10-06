import type { MemberStatus } from "@/lib/auth/access";
import type { Role } from "@/lib/auth/roleDefinitions";
import type { SourcingClient } from "@/lib/supabase/types";
import { getDisplayName } from "@/lib/users/displayName";

/** Pipeline statuses in display order (mirrors the job_candidates.status check). */
export const PIPELINE_STATUSES = ["New", "Reviewed", "Shortlisted", "Contacted", "Rejected", "Hired"] as const;

/**
 * One row of `sourcing.user_performance_stats()`, normalized. Candidate
 * statuses arrive as a jsonb object so a new status needs no migration.
 */
export interface UserStatsRow {
  user_id: string;
  jobs_count: number;
  runs_count: number;
  completed_runs: number;
  active_runs: number;
  failed_runs: number;
  candidates_count: number;
  status_counts: Record<string, number>;
  run_avg_sum: number;
  run_avg_count: number;
  last_activity_at: string | null;
}

/** The member columns every performance view needs. */
export interface MemberRow {
  user_id: string;
  email: string;
  full_name: string | null;
  role: Role;
  team_id: string | null;
  status: MemberStatus;
  requested_at: string;
}

export const MEMBER_ROW_COLUMNS = "user_id, email, full_name, role, team_id, status, requested_at";

export interface UserPerformanceRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
  teamName: string | null;
  status: MemberStatus;
  isActive: boolean;
  jobs: number;
  runs: number;
  completedRuns: number;
  activeRuns: number;
  failedRuns: number;
  candidates: number;
  newCandidates: number;
  reviewed: number;
  shortlisted: number;
  contacted: number;
  rejected: number;
  hired: number;
  averageMatchQuality: number | null;
  lastActivityAt: string | null;
  lastSignInAt: string | null;
}

export function memberDisplayName(member: Pick<MemberRow, "email" | "full_name">): string {
  return getDisplayName(member.email, member.full_name) ?? member.email;
}

export function statusCount(row: UserStatsRow | undefined, status: string): number {
  return row?.status_counts[status] ?? 0;
}

// Per-run averages are summed/counted in SQL so any grouping (user, team,
// org) can be combined without re-reading match rows: avg = sum / count.
export function averageOf(sum: number, count: number): number | null {
  return count > 0 ? Math.round(sum / count) : null;
}

export function sumStats(rows: UserStatsRow[], pick: (row: UserStatsRow) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

export function combinedAverageMatch(rows: UserStatsRow[]): number | null {
  return averageOf(
    sumStats(rows, (row) => row.run_avg_sum),
    sumStats(rows, (row) => row.run_avg_count),
  );
}

/** Status -> count across rows; always includes every known status (0 when absent). */
export function pipelineCountsOf(rows: UserStatsRow[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(PIPELINE_STATUSES.map((s) => [s, 0]));
  for (const row of rows) {
    for (const [status, count] of Object.entries(row.status_counts)) {
      counts[status] = (counts[status] ?? 0) + count;
    }
  }
  return counts;
}

function toStatusCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const counts: Record<string, number> = {};
  for (const [status, count] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(count);
    if (Number.isFinite(n)) counts[status] = n;
  }
  return counts;
}

/** Normalizes an RPC row (bigint/numeric may arrive as strings). */
export function toUserStatsRow(raw: {
  user_id: string;
  jobs_count: number | string;
  runs_count: number | string;
  completed_runs: number | string;
  active_runs: number | string;
  failed_runs: number | string;
  candidates_count: number | string;
  status_counts: unknown;
  run_avg_sum: number | string;
  run_avg_count: number | string;
  last_activity_at: string | null;
}): UserStatsRow {
  return {
    user_id: raw.user_id,
    jobs_count: Number(raw.jobs_count),
    runs_count: Number(raw.runs_count),
    completed_runs: Number(raw.completed_runs),
    active_runs: Number(raw.active_runs),
    failed_runs: Number(raw.failed_runs),
    candidates_count: Number(raw.candidates_count),
    status_counts: toStatusCounts(raw.status_counts),
    run_avg_sum: Number(raw.run_avg_sum),
    run_avg_count: Number(raw.run_avg_count),
    last_activity_at: raw.last_activity_at ?? null,
  };
}

/**
 * Loads per-user stats and last sign-ins. Both functions respect RLS
 * (visible_owner_ids), so the result only ever covers users the caller is
 * allowed to see; `userIds` narrows it further before SQL aggregates.
 */
export async function loadUserStats(
  supabase: SourcingClient,
  options: {
    /** Counts only jobs/runs/candidates created in this window; all-time when omitted. */
    window?: { from: string | null; to: string | null };
    userIds?: string[];
  } = {},
): Promise<{
  stats: Map<string, UserStatsRow>;
  signIns: Map<string, string | null>;
  error: boolean;
}> {
  const args: { p_from?: string; p_to?: string; p_user_ids?: string[] } = {};
  if (options.window?.from) args.p_from = options.window.from;
  if (options.window?.to) args.p_to = options.window.to;
  if (options.userIds) args.p_user_ids = options.userIds;

  const [statsRes, signInsRes] = await Promise.all([
    supabase.rpc("user_performance_stats", args),
    supabase.rpc("member_last_sign_ins"),
  ]);

  return {
    stats: new Map((statsRes.data ?? []).map((row) => [row.user_id, toUserStatsRow(row)])),
    signIns: new Map(
      (signInsRes.data ?? []).map((row) => [row.user_id, row.last_sign_in_at ?? null]),
    ),
    error: Boolean(statsRes.error || signInsRes.error),
  };
}

export function toUserPerformanceRow(
  member: MemberRow,
  stats: UserStatsRow | undefined,
  lastSignInAt: string | null,
  teamName: string | null,
): UserPerformanceRow {
  return {
    id: member.user_id,
    email: member.email,
    name: memberDisplayName(member),
    role: member.role,
    teamId: member.team_id,
    teamName,
    status: member.status,
    isActive: member.status === "active",
    jobs: stats?.jobs_count ?? 0,
    runs: stats?.runs_count ?? 0,
    completedRuns: stats?.completed_runs ?? 0,
    activeRuns: stats?.active_runs ?? 0,
    failedRuns: stats?.failed_runs ?? 0,
    candidates: stats?.candidates_count ?? 0,
    newCandidates: statusCount(stats, "New"),
    reviewed: statusCount(stats, "Reviewed"),
    shortlisted: statusCount(stats, "Shortlisted"),
    contacted: statusCount(stats, "Contacted"),
    rejected: statusCount(stats, "Rejected"),
    hired: statusCount(stats, "Hired"),
    averageMatchQuality: averageOf(stats?.run_avg_sum ?? 0, stats?.run_avg_count ?? 0),
    lastActivityAt: stats?.last_activity_at ?? null,
    lastSignInAt,
  };
}

/** Narrows a members row from the DB (role/status are plain text there). */
export function toMemberRow(row: {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  team_id: string | null;
  status: string;
  requested_at: string;
}): MemberRow {
  return { ...row, role: row.role as Role, status: row.status as MemberStatus };
}
