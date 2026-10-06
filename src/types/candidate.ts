import { z } from "zod";

export const normalizedCandidateSchema = z.object({
  name: z.string().nullable(),
  headline: z.string().nullable(),
  current_company: z.string().nullable(),
  location: z.string().nullable(),
  profile_url: z.string().nullable(),
  profile_image_url: z.string().nullable(),
  source: z.string(),
  source_url: z.string(),
  summary: z.string().nullable(),
  skills: z.array(z.string()),
  experience_years: z.number().nullable(),
  /** See CandidateSearchResult.location_verified. Optional so existing
   * callers/fixtures that never set it keep type-checking unchanged. */
  location_verified: z.boolean().nullable().optional(),
});

export type NormalizedCandidate = z.infer<typeof normalizedCandidateSchema>;

// ---------------------------------------------------------------------------
// Pipeline (per job) view models — what the jobs & candidates screens read.
// A person is global (sourcing.people); status, match and notes are per
// (job, person) in job_candidates / match_results / candidate_notes.
// ---------------------------------------------------------------------------

export interface MatchSummary {
  id: string;
  match_score: number;
  skills_score: number | null;
  experience_score: number | null;
  location_score: number | null;
  education_score: number | null;
  seniority_score: number | null;
  summary: string | null;
  created_at: string;
}

/** One row of GET /api/jobs/[id]/candidates. */
export interface JobCandidateListItem {
  job_id: string;
  person_id: string;
  /** The search run that found this person for this job. */
  search_run_id: string | null;
  /** The job version whose search found them, and its number. */
  job_version_id: string | null;
  version: number | null;
  name: string | null;
  headline: string | null;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  location_verified: boolean | null;
  photo_url: string | null;
  profile_url: string | null;
  open_to_work: boolean | null;
  experience_years: number | null;
  enrichment_status: string;
  skills: string[];
  status: string;
  status_changed_at: string | null;
  found_at: string;
  pre_score: number | null;
  match_score: number | null;
  scored_at: string | null;
  match: MatchSummary | null;
  viewed: boolean;
}

export interface MatchItem {
  kind?: string;
  requirement_id?: string | null;
  status?: "met" | "partial" | "missing" | string;
  text?: string;
  evidence?: string | null;
}

export interface MatchResultRecord extends MatchSummary {
  model: string;
  prompt_version: string;
  weights: unknown;
  items: MatchItem[];
}

export interface PersonExperience {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  employment_type: string | null;
  workplace_type: string | null;
  start_year: number | null;
  start_month: number | null;
  end_year: number | null;
  end_month: number | null;
  is_current: boolean;
  description: string | null;
  skills: string[];
  duration_text: string | null;
}

export interface PersonEducation {
  id: string;
  school: string | null;
  degree: string | null;
  field_of_study: string | null;
  start_year: number | null;
  end_year: number | null;
  description: string | null;
}

export interface PersonSkill {
  name: string;
  endorsements: number | null;
  is_top: boolean;
  source: string;
}

export interface PersonCertification {
  id: string;
  title: string;
  issuer: string | null;
  credential_url: string | null;
  issued_on: string | null;
  expires_on: string | null;
}

export interface PersonLanguage {
  id: string;
  name: string;
  proficiency: string | null;
}

export interface PersonProfile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  headline: string | null;
  about: string | null;
  search_snippet: string | null;
  current_title: string | null;
  current_company: string | null;
  location_text: string | null;
  city: string | null;
  country_code: string | null;
  location_verified: boolean | null;
  location_evidence: string | null;
  experience_years: number | null;
  open_to_work: boolean | null;
  hiring: boolean | null;
  premium: boolean | null;
  verified: boolean | null;
  connections_count: number | null;
  followers_count: number | null;
  photo_url: string | null;
  profile_url: string | null;
  enrichment_status: string;
  enriched_at: string | null;
}

export interface CandidateNoteRecord {
  id: string;
  note: string;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
}

/** GET /api/candidates/[personId]?jobId=… */
export interface CandidateDetailResponse {
  person: PersonProfile;
  experiences: PersonExperience[];
  education: PersonEducation[];
  skills: PersonSkill[];
  certifications: PersonCertification[];
  languages: PersonLanguage[];
  pipeline: {
    job_id: string;
    job_title: string;
    status: string;
    status_changed_at: string | null;
    found_at: string;
    match_score: number | null;
    scored_at: string | null;
  };
  /** match_results history for this job, newest first. */
  matches: MatchResultRecord[];
  notes: CandidateNoteRecord[];
  can_edit: boolean;
  owner_name: string | null;
}
