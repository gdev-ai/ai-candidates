import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import JSZip from "jszip";

import type { JobCandidateListItem } from "@/types/candidate";

import {
  EXPORT_HEADERS,
  buildCandidatesWorkbook,
  toExportRow,
  workbookToBuffer,
  type CandidateExportRow,
} from "./excel";

function getCandidatesSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet {
  const sheet = workbook.Sheets["Candidates"];
  if (!sheet) throw new Error("Candidates sheet not found");
  return sheet;
}

function makeRow(overrides: Partial<CandidateExportRow> = {}): CandidateExportRow {
  return {
    name: "Amina Hassan",
    current_title: "Senior React Developer",
    current_company: "Nile Software",
    headline: "Building UIs",
    location: "Cairo, Egypt",
    experience_years: 5.5,
    skills: ["React", "TypeScript"],
    match_score: 88,
    skills_score: 92,
    experience_score: 85,
    location_score: 100,
    education_score: 60,
    seniority_score: 90,
    ai_summary: "Strong match overall.",
    status: "New",
    open_to_work: true,
    linkedin_url: "https://www.linkedin.com/in/amina",
    notes: ["Great communicator"],
    found_at: "2026-01-15T00:00:00Z",
    ...overrides,
  };
}

function parse(rows: CandidateExportRow[]) {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(
    getCandidatesSheet(buildCandidatesWorkbook(rows)),
    { defval: "" },
  );
}

const col = (header: string) => XLSX.utils.encode_col(EXPORT_HEADERS.indexOf(header));

describe("buildCandidatesWorkbook", () => {
  it("writes one row per candidate", () => {
    const parsed = parse([makeRow({ name: "A" }), makeRow({ name: "B" }), makeRow({ name: "C" })]);
    expect(parsed.map((r) => r["Name"])).toEqual(["A", "B", "C"]);
  });

  it("has the expected columns in order, each with a width", () => {
    const sheet = getCandidatesSheet(buildCandidatesWorkbook([makeRow()]));
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    expect(rows[0]).toEqual(EXPORT_HEADERS);
    expect(EXPORT_HEADERS).toEqual(
      expect.arrayContaining(["Current Title", "Current Company", "LinkedIn URL", "Status", "Match Score"]),
    );
    expect(sheet["!cols"]?.length).toBe(EXPORT_HEADERS.length);
  });

  it("joins lists into readable text and renders nulls as empty cells", () => {
    const [row] = parse([
      makeRow({
        skills: ["React", "Next.js"],
        current_company: null,
        match_score: null,
        open_to_work: null,
        notes: [],
      }),
    ]);
    expect(row?.["Skills"]).toBe("React, Next.js");
    expect(row?.["Current Company"]).toBe("");
    expect(row?.["Match Score"]).toBe("");
    expect(row?.["Open to Work"]).toBe("");
    expect(JSON.stringify(row)).not.toContain("null");
  });

  it("stores scores and experience as numbers and dates as plain dates", () => {
    const sheet = getCandidatesSheet(
      buildCandidatesWorkbook([makeRow({ found_at: "2026-03-15T10:30:00Z" })]),
    );
    expect(sheet[`${col("Match Score")}2`]?.t).toBe("n");
    expect(sheet[`${col("Experience (Years)")}2`]?.v).toBe(5.5);
    expect(sheet[`${col("Date Found")}2`]?.v).toBe("2026-03-15");
  });

  it("makes the LinkedIn URL a hyperlink", () => {
    const sheet = getCandidatesSheet(buildCandidatesWorkbook([makeRow()]));
    expect(sheet[`${col("LinkedIn URL")}2`]?.l?.Target).toBe("https://www.linkedin.com/in/amina");
  });

  it("handles an empty list", () => {
    expect(parse([])).toEqual([]);
  });

  it("produces a valid .xlsx archive", async () => {
    const zip = await JSZip.loadAsync(workbookToBuffer(buildCandidatesWorkbook([makeRow()])));
    expect(Object.keys(zip.files)).toContain("xl/workbook.xml");
    expect(await zip.files["[Content_Types].xml"]?.async("string")).toContain("spreadsheetml");
  });
});

describe("toExportRow", () => {
  it("maps a pipeline row with its latest match and notes", () => {
    const candidate: JobCandidateListItem = {
      job_id: "j",
      person_id: "p",
      search_run_id: null,
      name: "Omar",
      headline: null,
      current_title: "Engineer",
      current_company: "Acme",
      location: "Giza",
      location_verified: true,
      photo_url: null,
      profile_url: "https://www.linkedin.com/in/omar",
      open_to_work: false,
      experience_years: 3,
      enrichment_status: "enriched",
      skills: ["Go"],
      status: "Shortlisted",
      status_changed_at: null,
      found_at: "2026-01-01T00:00:00Z",
      pre_score: null,
      match_score: 71,
      scored_at: null,
      match: {
        id: "m",
        match_score: 71,
        skills_score: 80,
        experience_score: null,
        location_score: 100,
        education_score: null,
        seniority_score: null,
        summary: "Good",
        created_at: "2026-01-02T00:00:00Z",
      },
      viewed: true,
    };
    expect(toExportRow(candidate, ["n1", "n2"])).toMatchObject({
      name: "Omar",
      current_company: "Acme",
      match_score: 71,
      skills_score: 80,
      ai_summary: "Good",
      status: "Shortlisted",
      open_to_work: false,
      linkedin_url: "https://www.linkedin.com/in/omar",
      notes: ["n1", "n2"],
    });
  });
});
