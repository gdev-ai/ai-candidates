import {
  parseDateRange,
  singleParam,
  type DateRangeSelection,
  type SearchParams,
} from "@/lib/dates/dateRange";

export const RUN_STATUSES = ["pending", "running", "complete", "error", "cancelled"] as const;

export interface SourcingFileFilters extends DateRangeSelection {
  memberId: string | null;
  status: (typeof RUN_STATUSES)[number] | null;
  jobTitle: string | null;
  minMatch: number | null;
  minCandidates: number | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUuid(value: string | null): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}

function parseBoundedInt(value: string | null, min: number, max: number): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : null;
}

/** Invalid or unknown values are dropped rather than rejected, so a hand-edited URL just falls back to "no filter". */
export function parseSourcingFileFilters(params: SearchParams): SourcingFileFilters {
  const status = singleParam(params, "status");

  return {
    memberId: parseUuid(singleParam(params, "member")),
    status: RUN_STATUSES.find((value) => value === status) ?? null,
    jobTitle: singleParam(params, "title")?.slice(0, 120) ?? null,
    ...parseDateRange(params, "all"),
    minMatch: parseBoundedInt(singleParam(params, "minMatch"), 0, 100),
    minCandidates: parseBoundedInt(singleParam(params, "minCandidates"), 0, 100000),
  };
}

export function hasActiveFilters(filters: SourcingFileFilters): boolean {
  return (
    filters.memberId !== null ||
    filters.status !== null ||
    filters.jobTitle !== null ||
    filters.range !== "all" ||
    filters.minMatch !== null ||
    filters.minCandidates !== null
  );
}
