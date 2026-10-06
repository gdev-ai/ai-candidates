import { z } from "zod";

import type { RequirementKind } from "@/types/job-analysis";

export const MATCH_ITEM_KINDS = [
  "skill_required",
  "skill_preferred",
  "education",
  "certification",
  "language",
  "industry",
  "responsibility",
  "keyword",
  "experience",
  "seniority",
  "location",
  "strength",
  "concern",
] as const;
export type MatchItemKind = (typeof MATCH_ITEM_KINDS)[number];

export const MATCH_ITEM_STATUSES = ["met", "partial", "missing"] as const;
export type MatchItemStatus = (typeof MATCH_ITEM_STATUSES)[number];

const score = z.number().min(0).max(100);

/**
 * What the model returns (strict schema). The overall match_score is not
 * asked for: it is computed in code from the sub-scores and MATCH_WEIGHTS so
 * it is reproducible. `requirement_ref` is the short "R3" label the prompt
 * gives each job_requirements row.
 */
export const matchOutputSchema = z.object({
  skills_score: score,
  experience_score: score,
  location_score: score,
  education_score: score,
  seniority_score: score,
  summary: z.string(),
  items: z.array(
    z.object({
      kind: z.enum(MATCH_ITEM_KINDS),
      requirement_ref: z.string().nullable(),
      status: z.enum(MATCH_ITEM_STATUSES),
      text: z.string(),
      evidence: z.string(),
    }),
  ),
});
export type MatchOutput = z.infer<typeof matchOutputSchema>;

/** Shape stored in match_results.items. */
export interface MatchItem {
  kind: MatchItemKind;
  requirement_id?: string;
  status: MatchItemStatus;
  text: string;
  evidence: string;
}

export const MATCH_WEIGHTS = {
  skills: 0.4,
  experience: 0.25,
  seniority: 0.15,
  education: 0.1,
  location: 0.1,
} as const;

/** A match_score at or above this counts as a strong match. */
export const STRONG_MATCH_THRESHOLD = 80;

export interface MatchingRequirement {
  id: string;
  kind: RequirementKind;
  text: string;
  weight: number;
}

export interface MatchingJob {
  id: string;
  title: string;
  description: string | null;
  seniority: string | null;
  employment_type: string | null;
  work_arrangement: string | null;
  city: string | null;
  country_code: string;
  min_experience: number | null;
  max_experience: number | null;
  requirements: MatchingRequirement[];
}

export interface MatchingExperience {
  title: string | null;
  company: string | null;
  location: string | null;
  start_year: number | null;
  start_month: number | null;
  end_year: number | null;
  end_month: number | null;
  is_current: boolean;
  description: string | null;
}

export interface MatchingPerson {
  id: string;
  full_name: string | null;
  headline: string | null;
  about: string | null;
  search_snippet: string | null;
  current_title: string | null;
  current_company: string | null;
  location_text: string | null;
  country_code: string | null;
  location_verified: boolean | null;
  experience_years: number | null;
  enriched: boolean;
  experiences: MatchingExperience[];
  education: {
    school: string | null;
    degree: string | null;
    field_of_study: string | null;
    start_year: number | null;
    end_year: number | null;
  }[];
  skills: { name: string; endorsements: number | null; is_top: boolean }[];
  certifications: { title: string; issuer: string | null; issued_on: string | null }[];
  languages: { name: string; proficiency: string | null }[];
}
