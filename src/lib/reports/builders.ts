import { actionLabel } from "@/lib/activity/actions";
import type { TeamSourcingFileRow } from "@/lib/manager/getTeamDashboardData";
import {
  averageOf,
  combinedAverageMatch,
  memberDisplayName,
  statusCount,
  sumStats,
  type MemberRow,
  type UserStatsRow,
} from "@/lib/performance/userStats";
import { REPORT_META, type Report, type ReportCell, type ReportMeta } from "@/lib/reports/types";

export interface ActivitySummaryRow {
  user_id: string;
  action: string;
  event_count: number;
  last_at: string;
}

function memberName(member: MemberRow): string {
  const name = memberDisplayName(member);
  return member.status === "active" ? name : `${name} (inactive)`;
}

function sortedMembers(members: MemberRow[]): MemberRow[] {
  return [...members].sort((a, b) => memberName(a).localeCompare(memberName(b)));
}

function statsFor(members: MemberRow[], stats: Map<string, UserStatsRow>): UserStatsRow[] {
  return members
    .map((member) => stats.get(member.user_id))
    .filter((row): row is UserStatsRow => row !== undefined);
}

function percentText(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

function baseReport(type: Report["type"], meta: ReportMeta) {
  return { type, ...REPORT_META[type], ...meta };
}

export function buildPerformanceReport(
  members: MemberRow[],
  stats: Map<string, UserStatsRow>,
  meta: ReportMeta,
): Report {
  const scoped = statsFor(members, stats);
  const n = (row: UserStatsRow | undefined, pick: (r: UserStatsRow) => number) =>
    row ? Number(pick(row)) : 0;

  const rows = sortedMembers(members).map((member) => {
    const row = stats.get(member.user_id);
    return {
      member: memberName(member),
      jobs: n(row, (r) => r.jobs_count),
      runs: n(row, (r) => r.runs_count),
      completed: n(row, (r) => r.completed_runs),
      active: n(row, (r) => r.active_runs),
      failed: n(row, (r) => r.failed_runs),
      candidates: n(row, (r) => r.candidates_count),
      shortlisted: n(row, (r) => statusCount(r, "Shortlisted")),
      contacted: n(row, (r) => statusCount(r, "Contacted")),
      rejected: n(row, (r) => statusCount(r, "Rejected")),
      averageMatch: row ? averageOf(row.run_avg_sum, row.run_avg_count) : null,
    };
  });

  const total = (pick: (r: UserStatsRow) => number) => sumStats(scoped, pick);
  const teamAverage = combinedAverageMatch(scoped);

  return {
    ...baseReport("performance", meta),
    summary: [
      { label: "Members", value: String(members.length) },
      { label: "Jobs created", value: String(total((r) => r.jobs_count)) },
      { label: "Sourcing runs", value: String(total((r) => r.runs_count)) },
      { label: "Candidates sourced", value: String(total((r) => r.candidates_count)) },
      { label: "Shortlisted", value: String(total((r) => statusCount(r, "Shortlisted"))) },
      { label: "Average match", value: percentText(teamAverage) },
    ],
    sections: [
      {
        id: "members",
        title: "Performance by member",
        description:
          "Counts cover jobs, runs, and candidates created in the selected period; candidate statuses are current.",
        columns: [
          { key: "member", label: "Member" },
          { key: "jobs", label: "Jobs", kind: "number" },
          { key: "runs", label: "Sourcing runs", kind: "number" },
          { key: "completed", label: "Completed runs", kind: "number" },
          { key: "active", label: "Active runs", kind: "number" },
          { key: "failed", label: "Failed runs", kind: "number" },
          { key: "candidates", label: "Candidates", kind: "number" },
          { key: "shortlisted", label: "Shortlisted", kind: "number" },
          { key: "contacted", label: "Contacted", kind: "number" },
          { key: "rejected", label: "Rejected", kind: "number" },
          { key: "averageMatch", label: "Avg match", kind: "match" },
        ],
        rows,
        totals: {
          member: "Total",
          jobs: total((r) => r.jobs_count),
          runs: total((r) => r.runs_count),
          completed: total((r) => r.completed_runs),
          active: total((r) => r.active_runs),
          failed: total((r) => r.failed_runs),
          candidates: total((r) => r.candidates_count),
          shortlisted: total((r) => statusCount(r, "Shortlisted")),
          contacted: total((r) => statusCount(r, "Contacted")),
          rejected: total((r) => statusCount(r, "Rejected")),
          averageMatch: teamAverage,
        },
        emptyMessage: "No members in this scope.",
      },
    ],
  };
}

const ACTIVITY_COLUMNS: { key: string; label: string; matches: (action: string) => boolean }[] = [
  { key: "logins", label: "Sign-ins", matches: (a) => a === "auth.login" },
  { key: "failedLogins", label: "Failed sign-ins", matches: (a) => a === "auth.login_failed" },
  { key: "jobActions", label: "Job actions", matches: (a) => a.startsWith("job.") },
  { key: "filesOpened", label: "Teammate files opened", matches: (a) => a === "sourcing_file.accessed" },
  { key: "candidateActions", label: "Candidate actions", matches: (a) => a.startsWith("candidate.") },
  { key: "teamActions", label: "Team changes", matches: (a) => a.startsWith("team.") },
  { key: "reportActions", label: "Reports", matches: (a) => a.startsWith("report.") },
];

export function buildActivityReport(
  members: MemberRow[],
  stats: Map<string, UserStatsRow>,
  activity: ActivitySummaryRow[],
  meta: ReportMeta,
): Report {
  const memberIds = new Set(members.map((member) => member.user_id));
  const scopedActivity = activity.filter((row) => memberIds.has(row.user_id));

  const rows = sortedMembers(members).map((member) => {
    const mine = scopedActivity.filter((row) => row.user_id === member.user_id);
    const cells: Record<string, ReportCell> = { member: memberName(member) };
    for (const column of ACTIVITY_COLUMNS) {
      cells[column.key] = mine
        .filter((row) => column.matches(row.action))
        .reduce((total, row) => total + Number(row.event_count), 0);
    }
    cells.runs = stats.get(member.user_id)?.runs_count ?? 0;
    cells.total = mine.reduce((total, row) => total + Number(row.event_count), 0);
    const lastAt = mine.map((row) => row.last_at).sort().at(-1) ?? null;
    cells.lastActivity = lastAt;
    return cells;
  });

  const sumColumn = (key: string) =>
    rows.reduce((total, row) => total + (typeof row[key] === "number" ? (row[key] as number) : 0), 0);

  const byAction = new Map<string, { events: number; users: Set<string> }>();
  for (const row of scopedActivity) {
    const entry = byAction.get(row.action) ?? { events: 0, users: new Set<string>() };
    entry.events += Number(row.event_count);
    entry.users.add(row.user_id);
    byAction.set(row.action, entry);
  }

  return {
    ...baseReport("activity", meta),
    summary: [
      { label: "Sign-ins", value: String(sumColumn("logins")) },
      { label: "Failed sign-ins", value: String(sumColumn("failedLogins")) },
      { label: "Sourcing runs", value: String(sumColumn("runs")) },
      { label: "Logged actions", value: String(sumColumn("total")) },
      {
        label: "Active members",
        value: `${rows.filter((row) => (row.total as number) > 0 || (row.runs as number) > 0).length} / ${members.length}`,
      },
    ],
    sections: [
      {
        id: "members",
        title: "Activity by member",
        description:
          "Sign-ins and actions are counted from the activity log, which started recording in September 2026; sourcing runs come from the runs themselves.",
        columns: [
          { key: "member", label: "Member" },
          ...ACTIVITY_COLUMNS.slice(0, 3).map((column) => ({ key: column.key, label: column.label, kind: "number" as const })),
          { key: "runs", label: "Sourcing runs", kind: "number" },
          ...ACTIVITY_COLUMNS.slice(3).map((column) => ({ key: column.key, label: column.label, kind: "number" as const })),
          { key: "total", label: "Logged actions", kind: "number" },
          { key: "lastActivity", label: "Last activity", kind: "date" },
        ],
        rows,
        totals: {
          member: "Total",
          ...Object.fromEntries(ACTIVITY_COLUMNS.map((column) => [column.key, sumColumn(column.key)])),
          runs: sumColumn("runs"),
          total: sumColumn("total"),
          lastActivity: null,
        },
        emptyMessage: "No members in this scope.",
      },
      {
        id: "actions",
        title: "Actions by type",
        columns: [
          { key: "action", label: "Action" },
          { key: "events", label: "Events", kind: "number" },
          { key: "members", label: "Members", kind: "number" },
        ],
        rows: Array.from(byAction.entries())
          .sort((a, b) => b[1].events - a[1].events)
          .map(([action, entry]) => ({
            action: actionLabel(action),
            events: entry.events,
            members: entry.users.size,
          })),
        emptyMessage: "No activity was recorded in this period.",
      },
    ],
  };
}

export function buildPipelineReport(
  members: MemberRow[],
  stats: Map<string, UserStatsRow>,
  meta: ReportMeta,
): Report {
  const scoped = statsFor(members, stats);
  const total = (pick: (r: UserStatsRow) => number) => sumStats(scoped, pick);
  const all = total((r) => r.candidates_count);
  const progressed =
    total((r) => statusCount(r, "Shortlisted")) + total((r) => statusCount(r, "Contacted")) + total((r) => statusCount(r, "Hired"));

  const rows = sortedMembers(members).map((member) => {
    const row = stats.get(member.user_id);
    const count = (pick: (r: UserStatsRow) => number) => (row ? Number(pick(row)) : 0);
    const candidates = count((r) => r.candidates_count);
    return {
      member: memberName(member),
      total: candidates,
      new: count((r) => statusCount(r, "New")),
      reviewed: count((r) => statusCount(r, "Reviewed")),
      shortlisted: count((r) => statusCount(r, "Shortlisted")),
      contacted: count((r) => statusCount(r, "Contacted")),
      rejected: count((r) => statusCount(r, "Rejected")),
      hired: count((r) => statusCount(r, "Hired")),
      progressed: ratio(
        count((r) => statusCount(r, "Shortlisted")) + count((r) => statusCount(r, "Contacted")) + count((r) => statusCount(r, "Hired")),
        candidates,
      ),
    };
  });

  return {
    ...baseReport("pipeline", meta),
    summary: [
      { label: "Total candidates", value: String(all) },
      { label: "New", value: String(total((r) => statusCount(r, "New"))) },
      { label: "Reviewed", value: String(total((r) => statusCount(r, "Reviewed"))) },
      { label: "Shortlisted", value: String(total((r) => statusCount(r, "Shortlisted"))) },
      { label: "Contacted", value: String(total((r) => statusCount(r, "Contacted"))) },
      { label: "Rejected", value: String(total((r) => statusCount(r, "Rejected"))) },
      { label: "Hired", value: String(total((r) => statusCount(r, "Hired"))) },
    ],
    sections: [
      {
        id: "members",
        title: "Pipeline by member",
        description:
          "Candidates sourced in the selected period, by their current status. \"Progressed\" is the share now shortlisted, contacted, or hired.",
        columns: [
          { key: "member", label: "Member" },
          { key: "total", label: "Total", kind: "number" },
          { key: "new", label: "New", kind: "number" },
          { key: "reviewed", label: "Reviewed", kind: "number" },
          { key: "shortlisted", label: "Shortlisted", kind: "number" },
          { key: "contacted", label: "Contacted", kind: "number" },
          { key: "rejected", label: "Rejected", kind: "number" },
          { key: "hired", label: "Hired", kind: "number" },
          { key: "progressed", label: "Progressed", kind: "percent" },
        ],
        rows,
        totals: {
          member: "Total",
          total: all,
          new: total((r) => statusCount(r, "New")),
          reviewed: total((r) => statusCount(r, "Reviewed")),
          shortlisted: total((r) => statusCount(r, "Shortlisted")),
          contacted: total((r) => statusCount(r, "Contacted")),
          rejected: total((r) => statusCount(r, "Rejected")),
          hired: total((r) => statusCount(r, "Hired")),
          progressed: ratio(progressed, all),
        },
        emptyMessage: "No members in this scope.",
      },
    ],
  };
}

export function buildQualityReport(
  members: MemberRow[],
  stats: Map<string, UserStatsRow>,
  files: TeamSourcingFileRow[],
  meta: ReportMeta,
): Report {
  const scoped = statsFor(members, stats);
  const teamAverage = combinedAverageMatch(scoped);
  const evaluated = files.filter((file) => file.averageMatch !== null);

  const byJob = new Map<string, { title: string; owner: string; files: number; scores: number[] }>();
  for (const file of files) {
    const entry = byJob.get(file.jobId) ?? {
      title: file.jobTitle,
      owner: file.ownerName,
      files: 0,
      scores: [],
    };
    entry.files += 1;
    if (file.averageMatch !== null) entry.scores.push(file.averageMatch);
    byJob.set(file.jobId, entry);
  }

  const mean = (scores: number[]) =>
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return {
    ...baseReport("quality", meta),
    summary: [
      { label: "Average match", value: percentText(teamAverage) },
      { label: "Files evaluated", value: `${evaluated.length} / ${files.length}` },
      { label: "Strong files (≥ 70%)", value: String(evaluated.filter((f) => (f.averageMatch ?? 0) >= 70).length) },
      { label: "Weak files (< 40%)", value: String(evaluated.filter((f) => (f.averageMatch ?? 0) < 40).length) },
    ],
    sections: [
      {
        id: "members",
        title: "Match quality by member",
        description: "Average of each evaluated file's average match score.",
        columns: [
          { key: "member", label: "Member" },
          { key: "evaluatedFiles", label: "Evaluated files", kind: "number" },
          { key: "averageMatch", label: "Avg match", kind: "match" },
        ],
        rows: sortedMembers(members).map((member) => {
          const row = stats.get(member.user_id);
          return {
            member: memberName(member),
            evaluatedFiles: row?.run_avg_count ?? 0,
            averageMatch: row ? averageOf(row.run_avg_sum, row.run_avg_count) : null,
          };
        }),
        totals: {
          member: "Team average",
          evaluatedFiles: sumStats(scoped, (r) => r.run_avg_count),
          averageMatch: teamAverage,
        },
        emptyMessage: "No members in this scope.",
      },
      {
        id: "jobs",
        title: "Match quality by job",
        columns: [
          { key: "job", label: "Job" },
          { key: "owner", label: "Owner" },
          { key: "files", label: "Files", kind: "number" },
          { key: "evaluatedFiles", label: "Evaluated", kind: "number" },
          { key: "averageMatch", label: "Avg match", kind: "match" },
          { key: "bestMatch", label: "Best file", kind: "match" },
        ],
        rows: Array.from(byJob.values())
          .map((job) => ({
            job: job.title,
            owner: job.owner,
            files: job.files,
            evaluatedFiles: job.scores.length,
            averageMatch: mean(job.scores),
            bestMatch: job.scores.length > 0 ? Math.max(...job.scores) : null,
          }))
          .sort((a, b) => (b.averageMatch ?? -1) - (a.averageMatch ?? -1)),
        emptyMessage: "No sourcing files were created in this period.",
      },
      {
        id: "files",
        title: "Match quality by sourcing file",
        columns: [
          { key: "job", label: "Job" },
          { key: "owner", label: "Owner" },
          { key: "status", label: "Status" },
          { key: "created", label: "Created", kind: "date" },
          { key: "candidates", label: "Candidates", kind: "number" },
          { key: "shortlisted", label: "Shortlisted", kind: "number" },
          { key: "averageMatch", label: "Avg match", kind: "match" },
        ],
        rows: files.map((file) => ({
          job: file.jobTitle,
          owner: file.ownerName,
          status: file.sourcingStatus,
          created: file.createdAt,
          candidates: file.totalCandidates,
          shortlisted: file.shortlistedCandidates,
          averageMatch: file.averageMatch,
        })),
        emptyMessage: "No sourcing files were created in this period.",
      },
    ],
  };
}
