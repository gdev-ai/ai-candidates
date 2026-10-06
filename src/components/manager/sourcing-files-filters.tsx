import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DATE_RANGE_LABELS, DATE_RANGES } from "@/lib/dates/dateRange";
import { RUN_STATUSES, type SourcingFileFilters } from "@/lib/manager/filters";

// Radix Select can't use "" as an item value; the filter parser treats any
// unrecognized value (including this one) as "no filter".
const ANY = "all";

const STATUS_LABELS: Record<(typeof RUN_STATUSES)[number], string> = {
  pending: "Pending",
  running: "Running",
  complete: "Complete",
  error: "Failed",
  cancelled: "Cancelled",
};

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

export function SourcingFilesFilters({
  filters,
  members,
  teamId,
  filtersActive,
}: {
  filters: SourcingFileFilters;
  members: { id: string; name: string }[];
  /** Only set for admins, who pick the team via the URL. */
  teamId: string | null;
  filtersActive: boolean;
}) {
  const resetHref = teamId ? `/manager?teamId=${teamId}` : "/manager";

  return (
    <form
      method="get"
      action="/manager"
      className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"
      aria-label="Filter sourcing files"
    >
      {teamId && <input type="hidden" name="teamId" value={teamId} />}

      <Field label="Team member">
        <Select name="member" defaultValue={filters.memberId ?? ANY}>
          <SelectTrigger className="h-8 bg-white" aria-label="Team member">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Everyone</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Job title" htmlFor="filter-title">
        <Input
          id="filter-title"
          name="title"
          defaultValue={filters.jobTitle ?? ""}
          placeholder="Any title"
          className="h-8 bg-white"
          maxLength={120}
        />
      </Field>

      <Field label="Status">
        <Select name="status" defaultValue={filters.status ?? ANY}>
          <SelectTrigger className="h-8 bg-white" aria-label="Sourcing status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any status</SelectItem>
            {RUN_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Created">
        <Select name="range" defaultValue={filters.range}>
          <SelectTrigger className="h-8 bg-white" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map((range) => (
              <SelectItem key={range} value={range}>
                {DATE_RANGE_LABELS[range]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="From" htmlFor="filter-from">
        <Input
          id="filter-from"
          type="date"
          name="from"
          defaultValue={filters.from ?? ""}
          className="h-8 bg-white"
        />
      </Field>

      <Field label="To" htmlFor="filter-to">
        <Input
          id="filter-to"
          type="date"
          name="to"
          defaultValue={filters.to ?? ""}
          className="h-8 bg-white"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Min match %" htmlFor="filter-min-match">
          <Input
            id="filter-min-match"
            type="number"
            name="minMatch"
            min={0}
            max={100}
            defaultValue={filters.minMatch ?? ""}
            className="h-8 bg-white"
          />
        </Field>
        <Field label="Min candidates" htmlFor="filter-min-candidates">
          <Input
            id="filter-min-candidates"
            type="number"
            name="minCandidates"
            min={0}
            defaultValue={filters.minCandidates ?? ""}
            className="h-8 bg-white"
          />
        </Field>
      </div>

      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" className="h-8 flex-1">
          Apply
        </Button>
        {filtersActive && (
          <Button asChild variant="outline" size="sm" className="h-8 bg-white">
            <Link href={resetHref}>Reset</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
