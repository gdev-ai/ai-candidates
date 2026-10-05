import { Clock } from "lucide-react";
import Link from "next/link";

import { EmptyCell } from "@/components/ui/empty-cell";
import type { TodaysCandidateRow } from "@/lib/dashboard/getDashboardData";

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TodaysCandidates({ candidates }: { candidates: TodaysCandidateRow[] }) {
  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
          <Clock className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-slate-900">No candidates sourced today yet</p>
        <p className="text-xs text-slate-500 max-w-xs mt-1">
          Candidates you find via search will show up here as they&apos;re discovered.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100" data-testid="todays-candidates-list">
      {candidates.map((candidate) => (
        <li key={`${candidate.jobId}:${candidate.personId}`} className="flex items-center justify-between py-3 gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/candidates/${candidate.personId}?jobId=${candidate.jobId}`}
              className="font-medium text-slate-900 hover:text-indigo-600 transition-colors truncate block text-sm"
            >
              {candidate.name ?? "Unnamed candidate"}
            </Link>
            <p className="text-xs text-slate-500 truncate">
              {candidate.headline ?? <EmptyCell />}
              {candidate.jobTitle && (
                <>
                  <span className="mx-1 text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  {candidate.jobTitle}
                </>
              )}
            </p>
          </div>
          <span className="shrink-0 text-xs text-slate-400 tabular-nums">
            {formatTime(candidate.foundAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
