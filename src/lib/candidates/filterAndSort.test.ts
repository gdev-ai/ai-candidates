import { describe, expect, it } from "vitest";

import {
  filterCandidates,
  parseCandidateQuery,
  sortCandidates,
  type CandidateForFiltering,
} from "./filterAndSort";

type Row = CandidateForFiltering & { id: string };

function make(overrides: Partial<Row> = {}): Row {
  return {
    id: "id",
    name: "Amina Hassan",
    current_title: "Frontend Engineer",
    current_company: "Nile Software",
    location: "Cairo, Egypt",
    experience_years: 5,
    skills: ["React", "TypeScript"],
    status: "New",
    found_at: "2026-01-01T00:00:00Z",
    match_score: 80,
    open_to_work: null,
    ...overrides,
  };
}

describe("filterCandidates", () => {
  it("matches name or current title, case-insensitively", () => {
    const rows = [make({ id: "a", name: "Amina" }), make({ id: "b", name: "Omar", current_title: "Data Analyst" })];
    expect(filterCandidates(rows, { name: "amina" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterCandidates(rows, { name: "analyst" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("filters by skill, location and current company (partial)", () => {
    const rows = [
      make({ id: "a", skills: ["React"], location: "Cairo", current_company: "Acme" }),
      make({ id: "b", skills: ["Vue"], location: "Giza", current_company: "Acme Labs" }),
    ];
    expect(filterCandidates(rows, { skill: "rea" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterCandidates(rows, { location: "giza" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterCandidates(rows, { company: "acme" })).toHaveLength(2);
  });

  it("excludes rows with missing values when that field is filtered", () => {
    const rows = [make({ location: null, current_company: null })];
    expect(filterCandidates(rows, { location: "cairo" })).toHaveLength(0);
    expect(filterCandidates(rows, { company: "x" })).toHaveLength(0);
  });

  it("filters by status exactly (case-insensitive)", () => {
    const rows = [make({ status: "New" }), make({ status: "Hired" })];
    expect(filterCandidates(rows, { status: "hired" })).toHaveLength(1);
    expect(filterCandidates(rows, { status: "Rejected" })).toHaveLength(0);
  });

  it("filters by open to work and minimum score", () => {
    const rows = [
      make({ id: "a", open_to_work: true, match_score: 90 }),
      make({ id: "b", open_to_work: false, match_score: 60 }),
      make({ id: "c", open_to_work: true, match_score: null }),
    ];
    expect(filterCandidates(rows, { openToWork: true }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterCandidates(rows, { minScore: 70 }).map((r) => r.id)).toEqual(["a"]);
  });

  it("filters by search run (sourcing file)", () => {
    const rows = [make({ id: "a", search_run_id: "r1" }), make({ id: "b", search_run_id: "r2" }), make({ id: "c", search_run_id: null })];
    expect(filterCandidates(rows, { runId: "r1" }).map((r) => r.id)).toEqual(["a"]);
    expect(parseCandidateQuery(new URLSearchParams("runId=r1")).filters.runId).toBe("r1");
  });

  it("combines filters as AND and ignores blank ones", () => {
    const rows = [
      make({ id: "a", name: "Amina", location: "Cairo" }),
      make({ id: "b", name: "Amina", location: "Giza" }),
    ];
    expect(filterCandidates(rows, { name: "amina", location: "cairo", skill: "  " }).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("sortCandidates", () => {
  it("sorts by match score with unscored last in both directions", () => {
    const rows = [make({ id: "a", match_score: 50 }), make({ id: "b", match_score: null }), make({ id: "c", match_score: 90 })];
    expect(sortCandidates(rows, "match_score", "desc").map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(sortCandidates(rows, "match_score", "asc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("sorts by name and by found date", () => {
    const rows = [
      make({ id: "a", name: "Zeyad", found_at: "2026-01-02T00:00:00Z" }),
      make({ id: "b", name: "Amina", found_at: "2026-01-03T00:00:00Z" }),
      make({ id: "c", name: null, found_at: "2026-01-01T00:00:00Z" }),
    ];
    expect(sortCandidates(rows, "name", "asc").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortCandidates(rows, "found_at", "desc").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("breaks ties by newest found first and does not mutate the input", () => {
    const rows = [
      make({ id: "old", match_score: 70, found_at: "2026-01-01T00:00:00Z" }),
      make({ id: "new", match_score: 70, found_at: "2026-02-01T00:00:00Z" }),
    ];
    expect(sortCandidates(rows, "match_score", "desc").map((r) => r.id)).toEqual(["new", "old"]);
    expect(rows.map((r) => r.id)).toEqual(["old", "new"]);
  });

  it("sorts by experience with unknown last", () => {
    const rows = [make({ id: "a", experience_years: 2.5 }), make({ id: "b", experience_years: null }), make({ id: "c", experience_years: 10 })];
    expect(sortCandidates(rows, "experience_years", "desc").map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});

describe("parseCandidateQuery", () => {
  it("defaults to best match first", () => {
    const q = parseCandidateQuery(new URLSearchParams());
    expect(q.sortBy).toBe("match_score");
    expect(q.sortDir).toBe("desc");
  });

  it("reads filters and rejects unknown sort fields", () => {
    const q = parseCandidateQuery(
      new URLSearchParams("name=am&status=New&open_to_work=true&min_score=70&sort_by=bogus&sort_dir=asc"),
    );
    expect(q.filters).toMatchObject({ name: "am", status: "New", openToWork: true, minScore: 70 });
    expect(q.sortBy).toBe("match_score");
    expect(q.sortDir).toBe("asc");
  });

  it("ignores a non-numeric min_score", () => {
    expect(parseCandidateQuery(new URLSearchParams("min_score=abc")).filters.minScore).toBeUndefined();
  });
});
