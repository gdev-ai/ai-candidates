import { Users } from "lucide-react";
import Link from "next/link";

import { TeamManagerSelect } from "@/components/admin/team-manager-select";
import { Badge, matchScoreTone } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { EmptyCell } from "@/components/ui/empty-cell";
import type { AdminTeamRow } from "@/lib/admin/getAdminDashboardData";

export function TeamsOverview({
  teams,
  managerOptions,
}: {
  teams: AdminTeamRow[];
  managerOptions: { id: string; name: string }[];
}) {
  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Users className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-slate-900">No teams yet</p>
        <p className="mt-1 max-w-xs text-xs text-slate-500">
          Create a team to start grouping HR users under a manager.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[760px] text-sm" data-testid="admin-teams-table">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="p-3 font-medium">Team</th>
            <th className="p-3 font-medium">Manager</th>
            <th className="p-3 text-right font-medium">Members</th>
            <th className="p-3 text-right font-medium">Jobs</th>
            <th className="p-3 text-right font-medium">Active Runs</th>
            <th className="p-3 text-right font-medium">Candidates</th>
            <th className="p-3 text-right font-medium">Shortlisted</th>
            <th className="p-3 text-right font-medium">Avg Match</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <ClickableRow
              key={team.id}
              href={`/manager?teamId=${team.id}`}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
            >
              <td className="p-3">
                <Link
                  href={`/manager?teamId=${team.id}`}
                  className="font-medium text-slate-900 underline-offset-4 hover:text-indigo-700 hover:underline"
                >
                  {team.name}
                </Link>
              </td>
              <td className="p-3">
                <TeamManagerSelect
                  teamId={team.id}
                  teamName={team.name}
                  managerId={team.managerId}
                  managerOptions={managerOptions}
                />
              </td>
              <td className="p-3 text-right tabular-nums text-slate-700">
                {team.activeMembers}
                {team.activeMembers !== team.members && (
                  <span className="text-slate-400"> / {team.members}</span>
                )}
              </td>
              <td className="p-3 text-right tabular-nums text-slate-700">{team.jobs}</td>
              <td className="p-3 text-right tabular-nums text-slate-700">{team.activeRuns}</td>
              <td className="p-3 text-right tabular-nums text-slate-700">{team.candidates}</td>
              <td className="p-3 text-right tabular-nums text-slate-700">{team.shortlisted}</td>
              <td className="p-3 text-right">
                {team.averageMatchQuality !== null ? (
                  <Badge tone={matchScoreTone(team.averageMatchQuality)}>
                    {team.averageMatchQuality}%
                  </Badge>
                ) : (
                  <EmptyCell />
                )}
              </td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}
