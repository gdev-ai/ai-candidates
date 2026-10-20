import { Search } from "lucide-react";
import Link from "next/link";

import { Badge, matchScoreTone, runStatusTone } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Button } from "@/components/ui/button";
import { EmptyCell } from "@/components/ui/empty-cell";
import { formatRelativeTime } from "@/lib/dates/formatRelativeTime";
import type { TeamSourcingFileRow } from "@/lib/manager/getTeamDashboardData";

export function TeamSourcingTable({
  rows,
  filtersActive = false,
  showOwner = true,
}: {
  rows: TeamSourcingFileRow[];
  filtersActive?: boolean;
  showOwner?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Search className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-slate-900">
          {filtersActive ? "No sourcing files match these filters" : "No sourcing files yet"}
        </p>
        <p className="mt-1 max-w-xs text-xs text-slate-500">
          {filtersActive
            ? "Try widening the date range or clearing a filter."
            : "Files appear here as soon as a team member runs a candidate search."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[1040px] text-sm" data-testid="team-sourcing-table">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="p-3 font-medium">Job Title</th>
            <th className="p-3 font-medium">Status</th>
            <th className="p-3 text-right font-medium">Candidates</th>
            <th className="p-3 text-right font-medium">Shortlisted</th>
            <th className="p-3 text-right font-medium">Unseen</th>
            <th className="p-3 text-right font-medium">Match</th>
            {showOwner && <th className="p-3 font-medium">Owned By</th>}
            <th className="p-3 font-medium">Last Accessed By</th>
            <th className="p-3 font-medium">Last Activity</th>
            <th className="p-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ClickableRow
              key={row.runId}
              href={`/candidates?jobId=${row.jobId}&runId=${row.runId}`}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
              data-testid="team-sourcing-row"
            >
              <td className="max-w-[220px] p-3">
                <p className="truncate font-medium text-slate-900">{row.jobTitle}</p>
                <p className="text-xs text-slate-500">
                  Created{" "}
                  {new Date(row.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                  {row.startedBy && row.startedBy !== row.ownerName && ` by ${row.startedBy}`}
                </p>
              </td>
              <td className="p-3">
                <Badge tone={runStatusTone(row.sourcingStatus)} className="capitalize">
                  {row.sourcingStatus}
                </Badge>
              </td>
              <td className="p-3 text-right tabular-nums text-slate-700">{row.totalCandidates}</td>
              <td className="p-3 text-right tabular-nums text-slate-700">
                {row.shortlistedCandidates}
              </td>
              <td className="p-3 text-right tabular-nums text-slate-700">{row.unseenCandidates}</td>
              <td className="p-3 text-right">
                {row.averageMatch !== null ? (
                  <Badge tone={matchScoreTone(row.averageMatch)}>{row.averageMatch}%</Badge>
                ) : (
                  <EmptyCell />
                )}
              </td>
              {showOwner && (
                <td className="p-3">
                  <Link
                    href={`/manager/team/${row.ownerId}`}
                    className="text-slate-700 underline-offset-4 hover:text-indigo-700 hover:underline"
                  >
                    {row.ownerName}
                  </Link>
                </td>
              )}
              <td className="p-3 text-slate-600">
                {row.lastAccessedBy ? (
                  <span className="inline-flex items-center gap-1.5">
                    {row.lastAccessedBy}
                    {row.lastAccessedByOther && (
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700">
                        Not owner
                      </span>
                    )}
                  </span>
                ) : (
                  <EmptyCell />
                )}
              </td>
              <td className="p-3 text-slate-500">{formatRelativeTime(row.lastActivityAt)}</td>
              <td className="p-3">
                <Button variant="outline" size="sm" asChild className="h-8 text-xs font-normal">
                  <Link href={`/candidates?jobId=${row.jobId}&runId=${row.runId}`}>View</Link>
                </Button>
              </td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}
