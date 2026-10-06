/**
 * Sourcing run progress shared by the workflow (writes `search_runs.stage`),
 * the status route and the loading screen. No server imports: the client
 * uses it too.
 */

/** Workflow stages, in order. `expanding` is a top-up search round. */
export const RUN_STAGES = [
  "searching",
  "locating",
  "expanding",
  "shortlisting",
  "enriching",
  "scoring",
  "finalizing",
] as const;
export type RunStage = (typeof RUN_STAGES)[number];

/** Used until there are enough finished runs to measure. */
export const FALLBACK_ESTIMATE_MINUTES = 2;
/** Fewer finished runs than this and the fallback is used. */
export const MIN_RUNS_FOR_ESTIMATE = 3;

/**
 * Minutes to tell the user a search takes: the median of recent run
 * durations, rounded up to a whole minute.
 */
export function estimateMinutes(durationsSeconds: number[]): number {
  const valid = durationsSeconds
    .filter((s) => Number.isFinite(s) && s > 0)
    .sort((a, b) => a - b);
  if (valid.length < MIN_RUNS_FOR_ESTIMATE) return FALLBACK_ESTIMATE_MINUTES;
  const mid = Math.floor(valid.length / 2);
  const at = (i: number) => valid[i] ?? 0;
  const median = valid.length % 2 ? at(mid) : (at(mid - 1) + at(mid)) / 2;
  return Math.max(1, Math.ceil(median / 60));
}

/** A person the run has AI-scored so far, shown live while it runs. */
export interface LiveCandidate {
  personId: string;
  name: string | null;
  headline: string | null;
  photoUrl: string | null;
  score: number;
}

/** GET /api/search/[runId]/status. */
export interface RunProgress {
  /** "search", or "score" for a scoring batch of people already on the job. */
  kind: "search" | "score";
  /** Scoring batch: how many people it reads and scores, and who. */
  target_count: number | null;
  target_person_ids?: string[];
  status: string;
  stage: RunStage | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  max_candidates: number | null;
  /** Queries run so far, including top-up rounds. */
  queries: number;
  /** LinkedIn results returned by the searches. */
  profiles_scanned: number;
  /** People confirmed in the job's country (linked to the job). */
  in_country: number;
  shortlist_size: number | null;
  enrich_total: number | null;
  enriched: number;
  scored: number;
  candidates_found: number | null;
  candidates_scored: number | null;
  candidates_new: number | null;
  /** Best scored so far, highest first (at most max_candidates). */
  top: LiveCandidate[];
}
