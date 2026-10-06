import { z } from "zod";

/** Mirror the sourcing.jobs / job_requirements check constraints. */
export const CITIES = ["Cairo", "Alexandria", "Giza", "Suez"] as const;
export const EMPLOYMENT_TYPE_VALUES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Internship",
] as const;
/**
 * Red outline for a New Job field the AI couldn't fill and the recruiter
 * hasn't filled yet.
 */
export const MISSING_FIELD_CLASS = "border-red-500 focus-visible:ring-red-500";

/**
 * Every run AI-scores exactly this many candidates (the most promising by
 * pre-score), so all searches cost about the same and the search credits
 * stay predictable.
 */
export const CANDIDATES_PER_RUN = 10;

export const WORK_ARRANGEMENT_VALUES = ["Remote", "Hybrid", "On-site"] as const;
export const SENIORITIES = [
  "intern",
  "junior",
  "mid",
  "senior",
  "lead",
  "manager",
  "director",
  "executive",
] as const;
export const REQUIREMENT_KINDS = [
  "skill_required",
  "skill_preferred",
  "education",
  "certification",
  "language",
  "industry",
  "responsibility",
  "keyword",
] as const;

export type City = (typeof CITIES)[number];
export type Seniority = (typeof SENIORITIES)[number];
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const SENIORITY_LABELS: Record<Seniority, string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead",
  manager: "Manager",
  director: "Director",
  executive: "Executive",
};

export const REQUIREMENT_KIND_LABELS: Record<RequirementKind, string> = {
  skill_required: "Required Skills",
  skill_preferred: "Preferred Skills",
  education: "Education",
  certification: "Certifications",
  language: "Languages",
  industry: "Industries",
  responsibility: "Responsibilities",
  keyword: "Keywords",
};

export interface RequirementInput {
  kind: RequirementKind;
  text: string;
}

/** Form values arrive as "" for "not chosen"; the DB wants null. */
function optionalEnum<const T extends readonly [string, ...string[]]>(
  values: T,
  message: string,
) {
  return z.preprocess(
    (v) =>
      v === undefined || (typeof v === "string" && v.trim() === "")
        ? null
        : typeof v === "string"
          ? v.trim()
          : v,
    z.enum(values, { message }).nullable(),
  );
}

const optionalYears = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .number()
    .min(0, "Experience can't be negative.")
    .max(99, "Experience is too large.")
    .nullable(),
);

export const requirementSchema = z.object({
  kind: z.enum(REQUIREMENT_KINDS),
  text: z.string().trim().min(1).max(500),
});

/** Drops blank rows and exact duplicates (same kind + text, case-insensitive). */
const requirementsSchema = z
  .array(z.object({ kind: z.enum(REQUIREMENT_KINDS), text: z.string() }))
  .max(300)
  .transform((rows) => {
    const seen = new Set<string>();
    const out: RequirementInput[] = [];
    for (const row of rows) {
      const text = row.text.trim();
      if (!text) continue;
      const key = `${row.kind}|${text.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: row.kind, text: text.slice(0, 500) });
    }
    return out;
  });

const jobFieldsSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().min(1, "Description is required."),
  company_id: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.uuid("Select a company.").nullable(),
  ),
  city: optionalEnum(CITIES, "Pick one of the listed cities."),
  employment_type: optionalEnum(
    EMPLOYMENT_TYPE_VALUES,
    "Invalid employment type.",
  ),
  work_arrangement: optionalEnum(
    WORK_ARRANGEMENT_VALUES,
    "Invalid work arrangement.",
  ),
  seniority: optionalEnum(SENIORITIES, "Invalid seniority."),
  min_experience: optionalYears,
  max_experience: optionalYears,
});

function experienceRangeOk(v: {
  min_experience?: number | null;
  max_experience?: number | null;
}) {
  return (
    v.min_experience == null ||
    v.max_experience == null ||
    v.min_experience <= v.max_experience
  );
}
const RANGE_ERROR = {
  message: "Minimum experience can't be more than maximum.",
  path: ["min_experience"],
};

export const jobCreateSchema = jobFieldsSchema
  .extend({
    requirements: requirementsSchema.default([]),
    analysisCallId: z.uuid().optional(),
  })
  .refine(experienceRangeOk, RANGE_ERROR);

export const jobUpdateSchema = jobFieldsSchema
  .partial()
  .extend({ requirements: requirementsSchema.optional() })
  .refine(experienceRangeOk, RANGE_ERROR);

export type JobCreateInput = z.infer<typeof jobCreateSchema>;
export type JobUpdateInput = z.infer<typeof jobUpdateSchema>;

/** Columns the job screens read (never select('*'): jobs.embedding is large). */
export const JOB_COLUMNS =
  "id, owner_id, company_id, title, description, country_code, city, employment_type, work_arrangement, seniority, min_experience, max_experience, created_at, updated_at";

export interface JobRecord {
  id: string;
  owner_id: string;
  company_id: string | null;
  title: string;
  description: string;
  country_code: string;
  city: string | null;
  employment_type: string | null;
  work_arrangement: string | null;
  seniority: string | null;
  min_experience: number | null;
  max_experience: number | null;
  created_at: string;
  updated_at: string;
}

export interface JobRequirementRecord {
  id: string;
  kind: RequirementKind;
  text: string;
  sort_order: number;
}

export interface JobListItem {
  id: string;
  title: string;
  company_id: string | null;
  company_name: string | null;
  city: string | null;
  employment_type: string | null;
  work_arrangement: string | null;
  seniority: string | null;
  created_at: string;
  candidate_count: number;
}

/** GET /api/jobs/[id] */
export interface JobDetailResponse {
  job: JobRecord;
  company: { id: string; name: string } | null;
  requirements: JobRequirementRecord[];
  analysis: {
    id: string;
    model: string;
    prompt_version: string;
    output: unknown;
    created_at: string;
  } | null;
  can_edit: boolean;
  owner_name: string | null;
}

/**
 * The editable part of the New Job form that the AI analysis pre-fills
 * (title, company, employment type and work arrangement are separate form
 * state, rendered alongside it).
 */
export interface RequirementsDraft {
  seniority: Seniority | "";
  city: City | "";
  min_experience: number | null;
  max_experience: number | null;
  requirements: RequirementInput[];
}

/**
 * The subset of the AI job analysis (src/types/job-analysis.ts) the form
 * reads. Structural and all-optional so it keeps working as that type
 * evolves.
 */
export interface AnalysisLike {
  job_title?: string;
  seniority?: string;
  employment_type?: string;
  years_of_experience?: { minimum?: number | null; maximum?: number | null };
  required_skills?: string[];
  preferred_skills?: string[];
  education?: string[];
  certifications?: string[];
  languages?: string[];
  industries?: string[];
  responsibilities?: string[];
  keywords?: string[];
}

const ANALYSIS_LIST_KINDS: [keyof AnalysisLike, RequirementKind][] = [
  ["required_skills", "skill_required"],
  ["preferred_skills", "skill_preferred"],
  ["education", "education"],
  ["certifications", "certification"],
  ["languages", "language"],
  ["industries", "industry"],
  ["responsibilities", "responsibility"],
  ["keywords", "keyword"],
];

export function toSeniority(value: string | null | undefined): Seniority | "" {
  const v = (value ?? "").trim().toLowerCase();
  return (SENIORITIES as readonly string[]).includes(v) ? (v as Seniority) : "";
}

export function analysisToDraft(analysis: AnalysisLike): RequirementsDraft {
  const requirements: RequirementInput[] = [];
  for (const [field, kind] of ANALYSIS_LIST_KINDS) {
    const items = analysis[field];
    if (!Array.isArray(items)) continue;
    for (const text of items) {
      if (typeof text === "string" && text.trim())
        requirements.push({ kind, text: text.trim() });
    }
  }
  return {
    seniority: toSeniority(analysis.seniority),
    city: "",
    min_experience: analysis.years_of_experience?.minimum ?? null,
    max_experience: analysis.years_of_experience?.maximum ?? null,
    requirements,
  };
}
