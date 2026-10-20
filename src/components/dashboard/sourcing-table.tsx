import { Search } from "lucide-react";
import Link from "next/link";

import { Badge, runStatusTone } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Button } from "@/components/ui/button";
import { EmptyCell } from "@/components/ui/empty-cell";
import type { UnifiedSourcingRow } from "@/lib/dashboard/getDashboardData";
import { formatRelativeTime } from "@/lib/dates/formatRelativeTime";

export function SourcingTable({ rows }: { rows: UnifiedSourcingRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
          <Search className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-slate-900">No sourcing activity yet</p>
        <p className="text-xs text-slate-500 max-w-xs mt-1">
          Run a search on any job to start building candidate pipelines — they&apos;ll show up
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[960px] text-sm" data-testid="sourcing-table">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="p-3 font-medium">Job Title</th>
            <th className="p-3 font-medium">Sourcing Status</th>
            <th className="p-3 font-medium text-right">Total Candidates</th>
            <th className="p-3 font-medium text-right">Shortlisted</th>
            <th className="p-3 font-medium text-right">Unseen</th>
            <th className="p-3 font-medium">File Created By</th>
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
              data-testid="sourcing-row"
            >
              <td className="p-3 font-medium text-slate-900 max-w-[220px] truncate">
                {row.jobTitle}
              </td>
              <td className="p-3">
                <Badge tone={runStatusTone(row.sourcingStatus)} className="capitalize">
                  {row.sourcingStatus}
                </Badge>
              </td>
              <td className="p-3 text-right tabular-nums text-slate-700">
                {row.totalCandidates}
              </td>
              <td className="p-3 text-right tabular-nums text-slate-700">
                {row.shortlistedCandidates}
              </td>
              <td className="p-3 text-right tabular-nums text-slate-700">
                {row.unseenCandidates}
              </td>
              <td className="p-3 text-slate-600">{row.fileCreatedBy ?? <EmptyCell />}</td>
              <td className="p-3 text-slate-600">{row.lastAccessedBy ?? <EmptyCell />}</td>
              <td className="p-3 text-slate-500">{formatRelativeTime(row.lastActivityTime)}</td>
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
