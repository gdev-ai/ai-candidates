import { describe, expect, it } from "vitest";

import {
  buildSnapshot,
  diffSnapshots,
  hasChanges,
  readSnapshot,
  sameSnapshot,
} from "@/lib/jobs/versions";

const job = {
  title: "Procurement Specialist",
  description: "Buys things.",
  company_id: "c1",
  employment_type: "Full-time",
  work_arrangement: "On-site",
  seniority: "mid",
  city: null,
  country_code: "EG",
  min_experience: "3.0",
  max_experience: 5,
};
const reqs = [
  { kind: "skill_required", text: "SAP" },
  { kind: "skill_required", text: "Negotiation" },
];

describe("buildSnapshot / readSnapshot", () => {
  it("normalizes numbers and round-trips through jsonb", () => {
    const s = buildSnapshot(job, reqs);
    expect(s.min_experience).toBe(3);
    // jsonb returns keys in its own order and numbers like 3.0.
    const stored = JSON.parse(
      JSON.stringify({ ...s, min_experience: 3.0, extra: 1 }),
    ) as unknown;
    expect(sameSnapshot(readSnapshot(stored), s)).toBe(true);
  });

  it("reads partial or malformed snapshots safely", () => {
    const s = readSnapshot({ title: "X", requirements: [{ kind: 1 }, null] });
    expect(s.title).toBe("X");
    expect(s.requirements).toEqual([]);
    expect(s.country_code).toBe("EG");
  });
});

describe("sameSnapshot", () => {
  const base = buildSnapshot(job, reqs);

  it("ignores surrounding whitespace", () => {
    const other = buildSnapshot({ ...job, title: " Procurement Specialist " }, [
      { kind: "skill_required", text: "SAP " },
      reqs[1]!,
    ]);
    expect(sameSnapshot(base, other)).toBe(true);
  });

  it("notices a changed field or requirement, not a reorder", () => {
    expect(
      sameSnapshot(base, buildSnapshot({ ...job, seniority: "senior" }, reqs)),
    ).toBe(false);
    expect(sameSnapshot(base, buildSnapshot(job, [reqs[0]!]))).toBe(false);
    expect(sameSnapshot(base, buildSnapshot(job, [reqs[1]!, reqs[0]!]))).toBe(
      true,
    );
  });
});

describe("diffSnapshots", () => {
  it("lists changed fields and added / removed requirements", () => {
    const from = buildSnapshot(job, reqs);
    const to = buildSnapshot({ ...job, seniority: "senior", city: "Cairo" }, [
      reqs[0]!,
      { kind: "certification", text: "CIPS" },
    ]);
    const changes = diffSnapshots(from, to);
    expect(changes.fields).toEqual([
      { field: "seniority", from: "mid", to: "senior" },
      { field: "city", from: "—", to: "Cairo" },
    ]);
    expect(changes.added).toEqual([{ kind: "certification", text: "CIPS" }]);
    expect(changes.removed).toEqual([
      { kind: "skill_required", text: "Negotiation" },
    ]);
    expect(hasChanges(changes)).toBe(true);
  });

  it("treats a reorder or case change of requirements as no change", () => {
    const from = buildSnapshot(job, reqs);
    const to = buildSnapshot(job, [
      { kind: "skill_required", text: "negotiation" },
      reqs[0]!,
    ]);
    expect(hasChanges(diffSnapshots(from, to))).toBe(false);
  });
});
