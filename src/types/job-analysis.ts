import { z } from "zod";

/** Mirrors the jobs.seniority check constraint. */
export const SENIORITY_LEVELS = [
  "intern",
  "junior",
  "mid",
  "senior",
  "lead",
  "manager",
  "director",
  "executive",
] as const;
export type Seniority = (typeof SENIORITY_LEVELS)[number];

/** Mirrors the jobs.employment_type check constraint. */
export const JOB_EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship"] as const;
export type JobEmploymentType = (typeof JOB_EMPLOYMENT_TYPES)[number];

/**
 * AI job-analysis output. Strict-mode compatible (every field required, no
 * defaults), so it doubles as the OpenAI response schema. `city`/`location`
 * are deliberately absent: the recruiter picks the city, never the AI.
 */
export const jobAnalysisSchema = z.object({
  job_title: z.string().min(1),
  seniority: z.enum(SENIORITY_LEVELS).nullable(),
  employment_type: z.enum(JOB_EMPLOYMENT_TYPES).nullable(),
  required_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()),
  years_of_experience: z.object({
    minimum: z.number().min(0).nullable(),
    maximum: z.number().min(0).nullable(),
  }),
  education: z.array(z.string()),
  certifications: z.array(z.string()),
  languages: z.array(z.string()),
  industries: z.array(z.string()),
  keywords: z.array(z.string()),
  responsibilities: z.array(z.string()),
  /** Alternative titles people with this job use on their profiles. */
  search_keywords: z.array(z.string()),
  /** Kept for compatibility; always empty — queries come from /api/jobs/generate-queries. */
  search_queries: z.array(z.string()),
});

export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

/** Mirrors the job_requirements.kind check constraint. */
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
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

const ANALYSIS_FIELD_BY_KIND: Record<RequirementKind, keyof JobAnalysis> = {
  skill_required: "required_skills",
  skill_preferred: "preferred_skills",
  education: "education",
  certification: "certifications",
  language: "languages",
  industry: "industries",
  responsibility: "responsibilities",
  keyword: "keywords",
};

/** Flattens an analysis into job_requirements rows (`{ kind, text }`), deduped per kind. */
export function analysisToRequirements(
  analysis: JobAnalysis,
): { kind: RequirementKind; text: string }[] {
  const rows: { kind: RequirementKind; text: string }[] = [];
  for (const kind of REQUIREMENT_KINDS) {
    const seen = new Set<string>();
    for (const raw of analysis[ANALYSIS_FIELD_BY_KIND[kind]] as string[]) {
      const text = raw.trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      rows.push({ kind, text });
    }
  }
  return rows;
}

/** Maps free-text seniority ("Sr.", "Mid-level", "Head of") onto the enum. */
export function normalizeSeniority(value: string | null | undefined): Seniority | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if ((SENIORITY_LEVELS as readonly string[]).includes(v)) return v as Seniority;
  if (/intern|trainee/.test(v)) return "intern";
  if (/junior|entry|graduate|\bjr\b/.test(v)) return "junior";
  if (/mid|intermediate|associate/.test(v)) return "mid";
  if (/senior|\bsr\b|experienced/.test(v)) return "senior";
  if (/lead|principal|staff/.test(v)) return "lead";
  if (/director|head/.test(v)) return "director";
  if (/chief|vp|vice president|executive|c-level|ceo|cto|cfo/.test(v)) return "executive";
  if (/manager/.test(v)) return "manager";
  return null;
}
