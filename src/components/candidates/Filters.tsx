"use client";

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
  openToWork: boolean;
  sortBy: CandidateSortField;
  sortDir: SortDirection;
}

export const DEFAULT_CANDIDATE_FILTERS: CandidateFilterState = {
  name: "",
  skill: "",
  location: "",
  company: "",
  status: "",
  openToWork: false,
  sortBy: "match_score",
  sortDir: "desc",
};

const ALL_STATUSES_VALUE = "all";

const SORT_OPTIONS: { value: CandidateSortField; label: string }[] = [
  { value: "match_score", label: "Match Score" },
  { value: "experience_years", label: "Experience" },
  { value: "name", label: "Name" },
  { value: "found_at", label: "Date Found" },
];

interface FiltersProps {
  value: CandidateFilterState;
  onChange: (value: CandidateFilterState) => void;
}

/** URL params understood by GET /api/jobs/[id]/candidates and the export route. */
export function buildFilterQueryString(filters: CandidateFilterState): string {
  const params = new URLSearchParams();
  if (filters.name.trim()) params.set("name", filters.name.trim());
  if (filters.skill.trim()) params.set("skill", filters.skill.trim());
  if (filters.location.trim()) params.set("location", filters.location.trim());
  if (filters.company.trim()) params.set("company", filters.company.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.openToWork) params.set("open_to_work", "true");
  params.set("sort_by", filters.sortBy);
  params.set("sort_dir", filters.sortDir);
  return params.toString();
}

export function Filters({ value, onChange }: FiltersProps) {
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
    const cleared = { ...DEFAULT_CANDIDATE_FILTERS, sortBy: value.sortBy, sortDir: value.sortDir };
    setDraft(cleared);
    onChange(cleared);
  }

  function updateStatus(status: string) {
    const updated = { ...draft, status: status === ALL_STATUSES_VALUE ? "" : status };
    setDraft(updated);
    onChange(updated);
  }

  function updateSort(sortBy: CandidateSortField) {
    const updated = { ...draft, sortBy };
    setDraft(updated);
    onChange(updated);
  }

  function toggleSortDir() {
    const updated: CandidateFilterState = {
      ...draft,
      sortDir: draft.sortDir === "asc" ? "desc" : "asc",
    };
    setDraft(updated);
    onChange(updated);
  }

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
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.openToWork}
            onChange={(e) => {
              const updated = { ...draft, openToWork: e.target.checked };
              setDraft(updated);
              onChange(updated);
            }}
            data-testid="filter-open-to-work"
            className="h-4 w-4 rounded border-border"
          />
          Open to work only
        </label>
        <Button type="button" onClick={applyFilters} data-testid="filter-apply">
          Apply Filters
        </Button>
        <Button type="button" variant="outline" onClick={clearFilters} data-testid="filter-clear">
          Clear
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by</span>
          <Select value={draft.sortBy} onValueChange={(v) => updateSort(v as CandidateSortField)}>
            <SelectTrigger className="w-[160px]" data-testid="filter-sort-field">
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
          <Button
            type="button"
            variant="outline"
            onClick={toggleSortDir}
            data-testid="filter-sort-direction"
          >
            {draft.sortDir === "desc" ? "High → Low" : "Low → High"}
          </Button>
        </div>
      </div>
    </div>
  );
}
