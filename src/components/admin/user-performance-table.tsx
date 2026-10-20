import Link from "next/link";

import { Badge, matchScoreTone } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { EmptyCell } from "@/components/ui/empty-cell";
import { ROLE_LABELS } from "@/lib/auth/roleDefinitions";
import { formatRelativeTime } from "@/lib/dates/formatRelativeTime";
import type { UserPerformanceRow } from "@/lib/performance/userStats";

export function UserPerformanceTable({
  users,
  showTeam = true,
  linkToMember = false,
}: {
  users: UserPerformanceRow[];
  showTeam?: boolean;
  linkToMember?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[1040px] text-sm" data-testid="admin-performance-table">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="p-3 font-medium">User</th>
            {showTeam && <th className="p-3 font-medium">Team</th>}
            <th className="p-3 text-right font-medium">Jobs</th>
            <th className="p-3 text-right font-medium">Runs</th>
            <th className="p-3 text-right font-medium">Candidates</th>
            <th className="p-3 text-right font-medium">Shortlisted</th>
            <th className="p-3 text-right font-medium">Contacted</th>
            <th className="p-3 text-right font-medium">Rejected</th>
            <th className="p-3 text-right font-medium">Avg Match</th>
            <th className="p-3 font-medium">Last Login</th>
            <th className="p-3 font-medium">Last Activity</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <Row
              key={user.id}
              href={linkToMember ? `/manager/team/${user.id}` : null}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
            >
              <td className="p-3">
                {linkToMember ? (
                  <Link
                    href={`/manager/team/${user.id}`}
                    className="font-medium text-slate-900 underline-offset-4 hover:text-indigo-700 hover:underline"
                  >
                    {user.name}
                  </Link>
                ) : (
                  <p className="font-medium text-slate-900">{user.name}</p>
                )}
                <p className="text-xs text-slate-500">
                  {ROLE_LABELS[user.role]}
                  {!user.isActive && " · Inactive"}
                </p>
              </td>
              {showTeam && (
                <td className="p-3 text-slate-600">{user.teamName ?? <EmptyCell />}</td>
              )}
              <td className="p-3 text-right tabular-nums text-slate-700">{user.jobs}</td>
              <td className="p-3 text-right tabular-nums text-slate-700">
                {user.completedRuns}
                <span className="text-slate-400"> / {user.runs}</span>
              </td>
              <td className="p-3 text-right tabular-nums text-slate-700">{user.candidates}</td>
              <td className="p-3 text-right tabular-nums text-slate-700">{user.shortlisted}</td>
              <td className="p-3 text-right tabular-nums text-slate-700">{user.contacted}</td>
              <td className="p-3 text-right tabular-nums text-slate-700">{user.rejected}</td>
              <td className="p-3 text-right">
                {user.averageMatchQuality !== null ? (
                  <Badge tone={matchScoreTone(user.averageMatchQuality)}>
                    {user.averageMatchQuality}%
                  </Badge>
                ) : (
                  <EmptyCell />
                )}
              </td>
              <td className="p-3 text-slate-500">{formatRelativeTime(user.lastSignInAt)}</td>
              <td className="p-3 text-slate-500">{formatRelativeTime(user.lastActivityAt)}</td>
            </Row>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Opens the member's page when there is one; a plain row otherwise. */
function Row({
  href,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { href: string | null }) {
  return href ? <ClickableRow href={href} {...props} /> : <tr {...props} />;
}
