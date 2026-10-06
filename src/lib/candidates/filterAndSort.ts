/** The fields of a job's candidate row that filtering and sorting read. */
export interface CandidateForFiltering {
  name: string | null;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  experience_years: number | null;
  skills: string[];
  status: string;
  found_at: string;
  match_score: number | null;
  /** Quick embedding fit; orders people the run kept without an AI score. */
  pre_score?: number | null;
  open_to_work?: boolean | null;
  search_run_id?: string | null;
  job_version_id?: string | null;
}

export interface CandidateFilters {
  /** Matches name or current title. */
  name?: string;
  skill?: string;
  location?: string;
  company?: string;
  status?: string;
  openToWork?: boolean;
  minScore?: number;
  /** Only people found by this search run (a sourcing file). */
  runId?: string;
  /** Only people found by this job version's searches. */
  versionId?: string;
}

export const CANDIDATE_SORT_FIELDS = [
  "match_score",
  "experience_years",
  "name",
  "found_at",
] as const;
export type CandidateSortField = (typeof CANDIDATE_SORT_FIELDS)[number];
export type SortDirection = "asc" | "desc";

function includesCaseInsensitive(
  haystack: string | null,
  needle: string,
): boolean {
  return (
    !!haystack && haystack.toLowerCase().includes(needle.trim().toLowerCase())
  );
}

/**
 * Applies every provided filter as an AND — a candidate must satisfy all
 * given criteria. Blank / undefined filters are ignored.
 */
export function filterCandidates<T extends CandidateForFiltering>(
  candidates: T[],
  filters: CandidateFilters,
): T[] {
  const name = filters.name?.trim();
  const skill = filters.skill?.trim();
  const location = filters.location?.trim();
  const company = filters.company?.trim();
  const status = filters.status?.trim().toLowerCase();

  return candidates.filter((c) => {
    if (
      name &&
      !includesCaseInsensitive(c.name, name) &&
      !includesCaseInsensitive(c.current_title, name)
    ) {
      return false;
    }
    if (skill && !c.skills.some((s) => includesCaseInsensitive(s, skill)))
      return false;
    if (location && !includesCaseInsensitive(c.location, location))
      return false;
    if (company && !includesCaseInsensitive(c.current_company, company))
      return false;
    if (status && c.status.toLowerCase() !== status) return false;
    if (filters.runId && c.search_run_id !== filters.runId) return false;
    if (filters.versionId && c.job_version_id !== filters.versionId)
      return false;
    if (filters.openToWork && c.open_to_work !== true) return false;
    if (
      filters.minScore !== undefined &&
      (c.match_score === null || c.match_score < filters.minScore)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Sorts without mutating the input. Candidates missing the sort value (no
 * score / unknown experience) always go last, whatever the direction, so
 * "unknown" never ranks above "known but low"; unscored people are ordered
 * among themselves by pre-score. Ties fall back to newest found first,
 * keeping pages stable.
 */
export function sortCandidates<T extends CandidateForFiltering>(
  candidates: T[],
  field: CandidateSortField,
  direction: SortDirection,
): T[] {
  const factor = direction === "asc" ? 1 : -1;

  function getValue(c: T): string | number | null {
    switch (field) {
      case "name":
        return c.name?.trim() || null;
      case "experience_years":
        return c.experience_years;
      case "match_score":
        return c.match_score;
      case "found_at":
        return c.found_at;
    }
  }

  return [...candidates].sort((a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    let result = 0;
    if (va === null && vb === null)
      result =
        field === "match_score"
          ? Number(b.pre_score ?? -1) - Number(a.pre_score ?? -1)
          : 0;
    else if (va === null) return 1;
    else if (vb === null) return -1;
    else if (typeof va === "string" && typeof vb === "string")
      result = factor * va.localeCompare(vb);
    else result = factor * ((va as number) - (vb as number));
    if (result !== 0 || field === "found_at") return result;
    return b.found_at.localeCompare(a.found_at);
  });
}

/** Reads filter/sort/page params shared by the candidates list and export routes. */
export function parseCandidateQuery(searchParams: URLSearchParams): {
  filters: CandidateFilters;
  sortBy: CandidateSortField;
  sortDir: SortDirection;
} {
  const sortParam = searchParams.get("sort_by");
  const sortBy = (CANDIDATE_SORT_FIELDS as readonly string[]).includes(
    sortParam ?? "",
  )
    ? (sortParam as CandidateSortField)
    : "match_score";
  const sortDir: SortDirection =
    searchParams.get("sort_dir") === "asc" ? "asc" : "desc";
  const minScoreRaw = searchParams.get("min_score");
  const minScore =
    minScoreRaw !== null && minScoreRaw !== ""
      ? Number(minScoreRaw)
      : undefined;

  return {
    filters: {
      name: searchParams.get("name") ?? undefined,
      skill: searchParams.get("skill") ?? undefined,
      location: searchParams.get("location") ?? undefined,
      company: searchParams.get("company") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      openToWork: searchParams.get("open_to_work") === "true" || undefined,
      minScore:
        minScore !== undefined && Number.isFinite(minScore)
          ? minScore
          : undefined,
      runId: searchParams.get("runId") || undefined,
      versionId: searchParams.get("versionId") || undefined,
    },
    sortBy,
    sortDir,
  };
}
