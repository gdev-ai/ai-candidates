import { describe, expect, it } from "vitest";

import {
  combinedAverageMatch,
  pipelineCountsOf,
  toMemberRow,
  toUserPerformanceRow,
  toUserStatsRow,
} from "@/lib/performance/userStats";

const raw = {
  user_id: "u1",
  jobs_count: "2",
  runs_count: 3,
  completed_runs: 2,
  active_runs: 1,
  failed_runs: 0,
  candidates_count: "5",
  status_counts: { New: 2, Shortlisted: "2", Hired: 1, Bogus: "x" },
  run_avg_sum: "150.5",
  run_avg_count: "2",
  last_activity_at: null,
};

describe("toUserStatsRow", () => {
  it("coerces bigint/numeric strings and drops non-numeric status counts", () => {
    const row = toUserStatsRow(raw);
    expect(row).toMatchObject({ jobs_count: 2, candidates_count: 5, run_avg_sum: 150.5, run_avg_count: 2 });
    expect(row.status_counts).toEqual({ New: 2, Shortlisted: 2, Hired: 1 });
  });

  it("treats a missing or malformed status_counts as empty", () => {
    expect(toUserStatsRow({ ...raw, status_counts: null }).status_counts).toEqual({});
    expect(toUserStatsRow({ ...raw, status_counts: [1, 2] }).status_counts).toEqual({});
  });
});

describe("pipelineCountsOf", () => {
  it("always lists the known statuses and keeps statuses it doesn't know yet", () => {
    const a = toUserStatsRow(raw);
    const b = toUserStatsRow({ ...raw, status_counts: { New: 1, Interviewing: 4 } });
    expect(pipelineCountsOf([a, b])).toEqual({
      New: 3,
      Reviewed: 0,
      Shortlisted: 2,
      Contacted: 0,
      Rejected: 0,
      Hired: 1,
      Interviewing: 4,
    });
  });
});

describe("combinedAverageMatch", () => {
  it("averages per-run averages across users", () => {
    const a = toUserStatsRow(raw); // 150.5 / 2
    const b = toUserStatsRow({ ...raw, run_avg_sum: 60, run_avg_count: 1 });
    expect(combinedAverageMatch([a, b])).toBe(70);
    expect(combinedAverageMatch([])).toBeNull();
  });
});

describe("toUserPerformanceRow", () => {
  it("prefers the member's real name and maps status", () => {
    const member = toMemberRow({
      user_id: "u1",
      email: "sara.ali@example.com",
      full_name: "Sara A. Ali",
      role: "hr_user",
      team_id: null,
      status: "disabled",
      requested_at: "2026-09-01",
    });
    const row = toUserPerformanceRow(member, toUserStatsRow(raw), null, null);
    expect(row).toMatchObject({ name: "Sara A. Ali", isActive: false, status: "disabled", shortlisted: 2, hired: 1, averageMatchQuality: 75 });
  });
});
