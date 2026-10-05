import { describe, expect, it } from "vitest";

import { notificationHref } from "@/lib/notifications/notifications";

const base = {
  user_id: "actor-1",
  action: "sourcing_run.completed",
  description: "Completed a sourcing run",
  metadata: null,
};

describe("notificationHref", () => {
  it("opens the sourcing file for run events that know their job", () => {
    expect(
      notificationHref({ ...base, entity_type: "search_run", entity_id: "run-1", metadata: { jobId: "job-1" } }),
    ).toBe("/candidates?jobId=job-1&runId=run-1");
  });

  it("opens the job's candidates for scoring events", () => {
    expect(notificationHref({ ...base, entity_type: "job", entity_id: "job-1" })).toBe("/candidates?jobId=job-1");
  });

  it("opens the candidate in the job's pipeline for shortlist/hire events", () => {
    expect(
      notificationHref({
        ...base,
        action: "candidate.status_changed",
        entity_type: "candidate",
        entity_id: "person-1",
        metadata: { jobId: "job-1", newStatus: "Shortlisted" },
      }),
    ).toBe("/candidates/person-1?jobId=job-1");
    expect(notificationHref({ ...base, entity_type: "candidate", entity_id: "person-1" })).toBe(
      "/candidates/person-1",
    );
  });

  it("sends admins to the Admin page for access requests", () => {
    expect(
      notificationHref({ ...base, action: "auth.access_requested", entity_type: "member", entity_id: "m-1" }),
    ).toBe("/admin");
  });

  it("falls back to the team member's page when the target is unknown", () => {
    expect(notificationHref({ ...base, entity_type: "search_run", entity_id: "run-1" })).toBe("/manager/team/actor-1");
    expect(notificationHref({ ...base, user_id: null, entity_type: "team", entity_id: null })).toBe("/manager");
  });

  it("ignores a non-string jobId in metadata", () => {
    expect(
      notificationHref({ ...base, entity_type: "search_run", entity_id: "run-1", metadata: { jobId: 5 } }),
    ).toBe("/manager/team/actor-1");
  });
});
