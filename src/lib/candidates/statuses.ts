/** Mirrors the sourcing.job_candidates.status check constraint. */
export const CANDIDATE_STATUSES = [
  "New",
  "Reviewed",
  "Shortlisted",
  "Contacted",
  "Rejected",
  "Hired",
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export function isCandidateStatus(value: unknown): value is CandidateStatus {
  return (
    typeof value === "string" &&
    (CANDIDATE_STATUSES as readonly string[]).includes(value)
  );
}
