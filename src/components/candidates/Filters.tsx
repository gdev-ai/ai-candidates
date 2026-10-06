"use client";

import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  GitBranch,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CANDIDATE_STATUSES } from "@/lib/candidates/statuses";
import { cn } from "@/lib/utils";
import type {
  CandidateSortField,
  SortDirection,
} from "@/lib/candidates/filterAndSort";

export interface CandidateFilterState {
  name: string;
  skill: string;
  location: string;
  company: string;
  status: string;
  sortBy: CandidateSortField;
  sortDir: SortDirection;
}

export const DEFAULT_CANDIDATE_FILTERS: CandidateFilterState = {
  name: "",
  skill: "",
  location: "",
  company: "",
  status: "",
  sortBy: "match_score",
  sortDir: "desc",
};

const ALL_STATUSES_VALUE = "all";
const ALL_VERSIONS_VALUE = "all";

/** How each sort field reads in each direction. */
const DIRECTION_LABELS: Record<
  CandidateSortField,
  { desc: string; asc: string }
> = {
  match_score: { desc: "Highest first", asc: "Lowest first" },
  experience_years: { desc: "Most first", asc: "Least first" },
  name: { desc: "Z → A", asc: "A → Z" },
  found_at: { desc: "Newest first", asc: "Oldest first" },
};

export interface VersionOption {
  id: string;
  version: number;
  candidates: number;
}

const SORT_OPTIONS: { value: CandidateSortField; label: string }[] = [
  { value: "match_score", label: "Match Score" },
  { value: "experience_years", label: "Experience" },
  { value: "name", label: "Name" },
  { value: "found_at", label: "Date Found" },
];

interface FiltersProps {
  value: CandidateFilterState;
  onChange: (value: CandidateFilterState) => void;
  /** The job's search versions; shows a version filter when given. */
  versions?: VersionOption[];
  versionId?: string | null;
  onVersionChange?: (versionId: string | null) => void;
}

/** URL params understood by GET /api/jobs/[id]/candidates and the export route. */
export function buildFilterQueryString(filters: CandidateFilterState): string {
  const params = new URLSearchParams();
  if (filters.name.trim()) params.set("name", filters.name.trim());
  if (filters.skill.trim()) params.set("skill", filters.skill.trim());
  if (filters.location.trim()) params.set("location", filters.location.trim());
  if (filters.company.trim()) params.set("company", filters.company.trim());
  if (filters.status) params.set("status", filters.status);
  params.set("sort_by", filters.sortBy);
  params.set("sort_dir", filters.sortDir);
  return params.toString();
}

export function Filters({
  value,
  onChange,
  versions,
  versionId = null,
  onVersionChange,
}: FiltersProps) {
  const [draft, setDraft] = useState(value);

  function updateDraft<K extends keyof CandidateFilterState>(
    key: K,
    fieldValue: CandidateFilterState[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: fieldValue }));
  }

  function applyFilters() {
    onChange(draft);
  }

  function clearFilters() {
    const cleared = {
      ...DEFAULT_CANDIDATE_FILTERS,
      sortBy: value.sortBy,
      sortDir: value.sortDir,
    };
    setDraft(cleared);
    onChange(cleared);
  }

  function updateStatus(status: string) {
    const updated = {
      ...draft,
      status: status === ALL_STATUSES_VALUE ? "" : status,
    };
    setDraft(updated);
    onChange(updated);
  }

  function updateSort(sortBy: CandidateSortField) {
    const updated = { ...draft, sortBy };
    setDraft(updated);
    onChange(updated);
  }

  function setSortDir(sortDir: SortDirection) {
    if (sortDir === draft.sortDir) return;
    const updated: CandidateFilterState = { ...draft, sortDir };
    setDraft(updated);
    onChange(updated);
  }

  const directionLabels = DIRECTION_LABELS[draft.sortBy];

  return (
    <div className="flex flex-col gap-4" data-testid="candidate-filters">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="Name or title"
          value={draft.name}
          onChange={(e) => updateDraft("name", e.target.value)}
          data-testid="filter-name"
        />
        <Input
          placeholder="Search by skill"
          value={draft.skill}
          onChange={(e) => updateDraft("skill", e.target.value)}
          data-testid="filter-skill"
        />
        <Input
          placeholder="Current company"
          value={draft.company}
          onChange={(e) => updateDraft("company", e.target.value)}
          data-testid="filter-company"
        />
        <Input
          placeholder="Location"
          value={draft.location}
          onChange={(e) => updateDraft("location", e.target.value)}
          data-testid="filter-location"
        />
        <Select
          value={draft.status === "" ? ALL_STATUSES_VALUE : draft.status}
          onValueChange={updateStatus}
        >
          <SelectTrigger data-testid="filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES_VALUE}>All statuses</SelectItem>
            {CANDIDATE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {versions && versions.length > 0 && onVersionChange && (
          <Select
            value={versionId ?? ALL_VERSIONS_VALUE}
            onValueChange={(v) =>
              onVersionChange(v === ALL_VERSIONS_VALUE ? null : v)
            }
          >
            <SelectTrigger className="w-[190px]" data-testid="filter-version">
              <span className="flex items-center gap-2">
                <GitBranch
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VERSIONS_VALUE}>
                All versions · {versions.reduce((n, v) => n + v.candidates, 0)}
              </SelectItem>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  Version {v.version} · {v.candidates}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button type="button" onClick={applyFilters} data-testid="filter-apply">
          Apply Filters
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={clearFilters}
          data-testid="filter-clear"
        >
          Clear
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by</span>
          <Select
            value={draft.sortBy}
            onValueChange={(v) => updateSort(v as CandidateSortField)}
          >
            <SelectTrigger
              className="w-[160px]"
              data-testid="filter-sort-field"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div
            className="flex h-10 items-center rounded-md border border-input bg-background p-1"
            role="radiogroup"
            aria-label="Sort direction"
            data-testid="filter-sort-direction"
          >
            {(["desc", "asc"] as const).map((dir) => {
              const Icon =
                dir === "desc" ? ArrowDownWideNarrow : ArrowUpNarrowWide;
              const active = draft.sortDir === dir;
              return (
                <button
                  key={dir}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSortDir(dir)}
                  data-testid={`filter-sort-${dir}`}
                  className={cn(
                    "flex h-full items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {directionLabels[dir]}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
