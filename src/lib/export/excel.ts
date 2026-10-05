import * as XLSX from "xlsx";

import type { JobCandidateListItem } from "@/types/candidate";

export interface CandidateExportRow {
  name: string | null;
  current_title: string | null;
  current_company: string | null;
  headline: string | null;
  location: string | null;
  experience_years: number | null;
  skills: string[];
  match_score: number | null;
  skills_score: number | null;
  experience_score: number | null;
  location_score: number | null;
  education_score: number | null;
  seniority_score: number | null;
  ai_summary: string | null;
  status: string;
  open_to_work: boolean | null;
  linkedin_url: string | null;
  notes: string[];
  found_at: string;
}

type Cell = string | number;

const COLUMNS: { header: string; width: number; value: (row: CandidateExportRow) => Cell }[] = [
  { header: "Name", width: 22, value: (r) => r.name ?? "" },
  { header: "Current Title", width: 26, value: (r) => r.current_title ?? "" },
  { header: "Current Company", width: 22, value: (r) => r.current_company ?? "" },
  { header: "Headline", width: 30, value: (r) => r.headline ?? "" },
  { header: "Location", width: 20, value: (r) => r.location ?? "" },
  { header: "Experience (Years)", width: 12, value: (r) => r.experience_years ?? "" },
  { header: "Skills", width: 36, value: (r) => r.skills.join(", ") },
  { header: "Match Score", width: 12, value: (r) => r.match_score ?? "" },
  { header: "Skills Score", width: 12, value: (r) => r.skills_score ?? "" },
  { header: "Experience Score", width: 14, value: (r) => r.experience_score ?? "" },
  { header: "Location Score", width: 14, value: (r) => r.location_score ?? "" },
  { header: "Education Score", width: 14, value: (r) => r.education_score ?? "" },
  { header: "Seniority Score", width: 14, value: (r) => r.seniority_score ?? "" },
  { header: "AI Summary", width: 48, value: (r) => r.ai_summary ?? "" },
  { header: "Status", width: 12, value: (r) => r.status },
  {
    header: "Open to Work",
    width: 12,
    value: (r) => (r.open_to_work === true ? "Yes" : r.open_to_work === false ? "No" : ""),
  },
  { header: "LinkedIn URL", width: 40, value: (r) => r.linkedin_url ?? "" },
  { header: "Recruiter Notes", width: 40, value: (r) => r.notes.join("\n") },
  { header: "Date Found", width: 14, value: (r) => formatDate(r.found_at) },
];

export const EXPORT_HEADERS = COLUMNS.map((c) => c.header);

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** Maps a pipeline row (+ its notes, newest first) to a spreadsheet row. */
export function toExportRow(candidate: JobCandidateListItem, notes: string[]): CandidateExportRow {
  const match = candidate.match;
  return {
    name: candidate.name,
    current_title: candidate.current_title,
    current_company: candidate.current_company,
    headline: candidate.headline,
    location: candidate.location,
    experience_years: candidate.experience_years,
    skills: candidate.skills,
    match_score: candidate.match_score,
    skills_score: match?.skills_score ?? null,
    experience_score: match?.experience_score ?? null,
    location_score: match?.location_score ?? null,
    education_score: match?.education_score ?? null,
    seniority_score: match?.seniority_score ?? null,
    ai_summary: match?.summary ?? null,
    status: candidate.status,
    open_to_work: candidate.open_to_work,
    linkedin_url: candidate.profile_url,
    notes,
    found_at: candidate.found_at,
  };
}

export function buildCandidatesWorkbook(rows: CandidateExportRow[]): XLSX.WorkBook {
  const sheetData: Cell[][] = [EXPORT_HEADERS, ...rows.map((row) => COLUMNS.map((c) => c.value(row)))];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  worksheet["!cols"] = COLUMNS.map((c) => ({ wch: c.width }));

  // Make LinkedIn URLs clickable.
  const urlCol = COLUMNS.findIndex((c) => c.header === "LinkedIn URL");
  rows.forEach((row, i) => {
    if (!row.linkedin_url) return;
    const cell = worksheet[XLSX.utils.encode_cell({ r: i + 1, c: urlCol })] as XLSX.CellObject | undefined;
    if (cell) cell.l = { Target: row.linkedin_url };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Candidates");
  return workbook;
}

export function workbookToBuffer(workbook: XLSX.WorkBook): Buffer {
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
