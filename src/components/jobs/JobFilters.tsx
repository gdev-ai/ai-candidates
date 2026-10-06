"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CITIES,
  EMPLOYMENT_TYPE_VALUES,
  SENIORITIES,
  SENIORITY_LABELS,
} from "@/types/job";

export type JobSort = "newest" | "oldest" | "title_asc" | "title_desc";

export interface JobFilterState {
  q: string;
  city: string;
  employmentType: string;
  seniority: string;
  sort: JobSort;
}

export const DEFAULT_JOB_FILTERS: JobFilterState = {
  q: "",
  city: "",
  employmentType: "",
  seniority: "",
  sort: "newest",
};

const ALL = "all";

const SORT_OPTIONS: { value: JobSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title_asc", label: "Title A → Z" },
  { value: "title_desc", label: "Title Z → A" },
];

const SORT_PARAMS: Record<JobSort, { by: string; dir: string }> = {
  newest: { by: "created_at", dir: "desc" },
  oldest: { by: "created_at", dir: "asc" },
  title_asc: { by: "title", dir: "asc" },
  title_desc: { by: "title", dir: "desc" },
};

export function hasActiveJobFilters(f: JobFilterState): boolean {
  return Boolean(f.q.trim() || f.city || f.employmentType || f.seniority);
}

/** URL params understood by GET /api/jobs. */
export function buildJobQueryString(filters: JobFilterState): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.city) params.set("city", filters.city);
  if (filters.employmentType)
    params.set("employment_type", filters.employmentType);
  if (filters.seniority) params.set("seniority", filters.seniority);
  const sort = SORT_PARAMS[filters.sort];
  params.set("sort_by", sort.by);
  params.set("sort_dir", sort.dir);
  return params.toString();
}

function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
  testId,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
  testId: string;
  className?: string;
}) {
  return (
    <Select
      value={value === "" ? ALL : value}
      onValueChange={(v) => onChange(v === ALL ? "" : v)}
    >
      <SelectTrigger className={className} data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Search box, filters and sort for a list of jobs. Typing is debounced;
 * the dropdowns apply immediately.
 */
export function JobFilters({
  value,
  onChange,
}: {
  value: JobFilterState;
  onChange: (value: JobFilterState) => void;
}) {
  const [search, setSearch] = useState(value.q);

  useEffect(() => {
    if (search === value.q) return;
    const timer = setTimeout(() => onChange({ ...value, q: search }), 300);
    return () => clearTimeout(timer);
  }, [search, value, onChange]);

  function set<K extends keyof JobFilterState>(key: K, v: JobFilterState[K]) {
    onChange({ ...value, [key]: v });
  }

  function clear() {
    setSearch("");
    onChange({ ...DEFAULT_JOB_FILTERS, sort: value.sort });
  }

  return (
    <div
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
      data-testid="job-filters"
    >
      <div className="relative min-w-[220px] flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search by job title or company"
          aria-label="Search jobs"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="job-search"
        />
      </div>
      <FilterSelect
        value={value.city}
        onChange={(v) => set("city", v)}
        allLabel="All cities"
        options={CITIES.map((c) => ({ value: c, label: c }))}
        testId="job-filter-city"
        className="w-full sm:w-[140px]"
      />
      <FilterSelect
        value={value.employmentType}
        onChange={(v) => set("employmentType", v)}
        allLabel="All types"
        options={EMPLOYMENT_TYPE_VALUES.map((t) => ({ value: t, label: t }))}
        testId="job-filter-type"
        className="w-full sm:w-[140px]"
      />
      <FilterSelect
        value={value.seniority}
        onChange={(v) => set("seniority", v)}
        allLabel="All seniorities"
        options={SENIORITIES.map((s) => ({
          value: s,
          label: SENIORITY_LABELS[s],
        }))}
        testId="job-filter-seniority"
        className="w-full sm:w-[160px]"
      />
      <Select
        value={value.sort}
        onValueChange={(v) => set("sort", v as JobSort)}
      >
        <SelectTrigger
          className="w-full sm:w-[150px]"
          aria-label="Sort jobs"
          data-testid="job-sort"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(hasActiveJobFilters(value) || search) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          data-testid="job-filter-clear"
        >
          Clear
        </Button>
      )}
    </div>
  );
}
