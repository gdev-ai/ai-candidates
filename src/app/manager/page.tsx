import {
  Activity,
  Briefcase,
  EyeOff,
  FolderSearch,
  History,
  Target,
  UserCheck,
  Users,
} from "lucide-react";

import { UserPerformanceTable } from "@/components/admin/user-performance-table";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { DashboardNav } from "@/components/dashboard/nav";
import {
  PipelineChart,
  STAGE_COLOR,
} from "@/components/dashboard/pipeline-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { SourcingFilesFilters } from "@/components/manager/sourcing-files-filters";
import { TeamMemberCards } from "@/components/manager/team-member-cards";
import { TeamPicker } from "@/components/manager/team-picker";
import { TeamSourcingTable } from "@/components/manager/team-sourcing-table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { parseSourcingFileFilters, parseUuid } from "@/lib/manager/filters";
import { getTeamDashboardData } from "@/lib/manager/getTeamDashboardData";
import { resolveManagerScope } from "@/lib/manager/scope";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <main className="min-h-screen bg-slate-50/70 pb-16">
      <DashboardNav />
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Users className="h-7 w-7" />
        </div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">
          {title}
        </h1>
        <p className="mt-2 max-w-md text-sm text-slate-500">{message}</p>
      </div>
    </main>
  );
}

export default async function ManagerDashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedTeamId = parseUuid(
    typeof params.teamId === "string" ? params.teamId : null,
  );
  const { supabase, member, teamId, teamOptions } =
    await resolveManagerScope(requestedTeamId);

  if (!teamId) {
    return member.role === "admin" ? (
      <EmptyState
        title="No teams yet"
        message="Create a team from the Admin dashboard to see its team dashboard here."
      />
    ) : (
      <EmptyState
        title="You're not assigned to a team yet"
        message="Ask an admin to make you the manager of your team. Your team's dashboard will appear here."
      />
    );
  }

  const filters = parseSourcingFileFilters(params);
  const data = await getTeamDashboardData(supabase, teamId, filters);

  if (!data) {
    return (
      <EmptyState
        title="Team unavailable"
        message="This team doesn't exist or you don't have access to it."
      />
    );
  }

  const {
    team,
    totals,
    pipelineCounts,
    members,
    sourcingFiles,
    filtersActive,
    recentActivity,
    loadError,
  } = data;
  const manager = members.find((member) => member.id === team.managerId);
  const isAdminView = teamOptions !== null;

  return (
    <main className="min-h-screen bg-slate-50/70 pb-16">
      <DashboardNav />
      <div className="animate-page-enter mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {isAdminView ? "Admin view · Team" : "Team view"}
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
              {team.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {manager ? `Managed by ${manager.name}` : "No manager assigned"} ·{" "}
              {totals.activeMembers} active{" "}
              {totals.activeMembers === 1 ? "member" : "members"}. Team members
              keep ownership of their files — you have management-level
              visibility.
            </p>
          </div>
          {isAdminView && teamOptions.length > 1 && (
            <TeamPicker teams={teamOptions} currentTeamId={team.id} />
          )}
        </div>

        {loadError && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <p role="alert" className="text-sm font-medium text-red-800">
              {loadError}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Team Members"
            value={`${totals.activeMembers} / ${totals.members}`}
            icon={Users}
          />
          <StatCard label="Team Jobs" value={totals.jobs} icon={Briefcase} />
          <StatCard
            label="Average Match Quality"
            value={
              totals.averageMatchQuality !== null
                ? `${totals.averageMatchQuality}%`
                : "No evaluated files yet"
            }
            icon={Target}
          />
          <StatCard
            label="Shortlisted Talent"
            value={totals.shortlisted}
            icon={UserCheck}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="col-span-1 border-slate-200 shadow-sm lg:col-span-2">
            <CardHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <Activity className="h-4 w-4 text-indigo-600" />
                    Team Pipeline
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Candidate status breakdown across your team&apos;s files
                  </CardDescription>
                </div>
                <Badge tone="neutral">{totals.candidates} total</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <PipelineChart counts={pipelineCounts} />
            </CardContent>
          </Card>

          <Card className="col-span-1 border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <FolderSearch className="h-4 w-4 text-indigo-600" />
                Sourcing Runs
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Your team&apos;s sourcing activity at a glance
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <dl className="flex flex-col divide-y divide-slate-100 text-sm">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-slate-600">Running</dt>
                  <dd>
                    <Badge tone={totals.activeRuns > 0 ? "warning" : "neutral"}>
                      {totals.activeRuns}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-slate-600">Completed</dt>
                  <dd>
                    <Badge tone="good">{totals.completedRuns}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-slate-600">Failed</dt>
                  <dd>
                    <Badge
                      tone={totals.failedRuns > 0 ? "critical" : "neutral"}
                    >
                      {totals.failedRuns}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="flex items-center gap-1.5 text-slate-600">
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    Unseen by you
                  </dt>
                  <dd className="font-medium tabular-nums text-slate-900">
                    {totals.unseen}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="flex items-center gap-2 text-slate-600">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: STAGE_COLOR.Contacted }}
                    />
                    Contacted candidates
                  </dt>
                  <dd className="font-medium tabular-nums text-slate-900">
                    {totals.contacted}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="flex items-center gap-2 text-slate-600">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: STAGE_COLOR.Rejected }}
                    />
                    Rejected candidates
                  </dt>
                  <dd className="font-medium tabular-nums text-slate-900">
                    {totals.rejected}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Users className="h-4 w-4 text-indigo-600" />
              Team Members
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Open a member to see their performance, files, and activity
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <TeamMemberCards members={members} managerId={team.managerId} />
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Briefcase className="h-4 w-4 text-indigo-600" />
                Team Sourcing Files
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Every sourcing file owned by your team. Opening one is recorded
                as an access by you, not a change of owner.
              </CardDescription>
            </div>
            <Badge tone="neutral">
              {sourcingFiles.length}{" "}
              {sourcingFiles.length === 1 ? "file" : "files"}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-4">
            <SourcingFilesFilters
              filters={filters}
              members={members.map((member) => ({
                id: member.id,
                name: member.name,
              }))}
              teamId={isAdminView ? team.id : null}
              filtersActive={filtersActive}
            />
            <TeamSourcingTable
              rows={sourcingFiles}
              filtersActive={filtersActive}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="col-span-1 border-slate-200 shadow-sm lg:col-span-2">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Target className="h-4 w-4 text-indigo-600" />
                Member Comparison
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Output per team member — runs shown as completed / total
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <UserPerformanceTable
                users={members}
                showTeam={false}
                linkToMember
              />
            </CardContent>
          </Card>

          <Card className="col-span-1 border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <History className="h-4 w-4 text-indigo-600" />
                Team Activity
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Latest recorded actions by your team
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <ActivityFeed activity={recentActivity} />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
