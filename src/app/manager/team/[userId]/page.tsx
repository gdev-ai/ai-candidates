import {
  Activity,
  ArrowLeft,
  Briefcase,
  FolderOpen,
  FolderSearch,
  History,
  Target,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { DashboardNav } from "@/components/dashboard/nav";
import { PipelineChart } from "@/components/dashboard/pipeline-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { TeamSourcingTable } from "@/components/manager/team-sourcing-table";
import { Badge, matchScoreTone } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/auth/roleDefinitions";
import { formatRelativeTime } from "@/lib/dates/formatRelativeTime";
import { parseUuid } from "@/lib/manager/filters";
import { getTeamMemberData } from "@/lib/manager/getTeamMemberData";
import { resolveManagerScope } from "@/lib/manager/scope";

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const memberId = parseUuid(userId);
  if (!memberId) notFound();

  const { supabase, member: viewer, teamId: managedTeamId, teamOptions } = await resolveManagerScope(null);
  const data = await getTeamMemberData(supabase, memberId);

  // RLS already hides other teams' members from an HR Manager; this repeats
  // the check (against the team they manage) so an out-of-team id can never
  // render, even if a policy changes.
  if (
    !data ||
    (viewer.role === "hr_manager" &&
      (managedTeamId === null || data.member.teamId !== managedTeamId))
  ) {
    notFound();
  }

  const { member, pipelineCounts, files, recentlyOpened, recentActivity, loadError } = data;
  const backHref =
    teamOptions !== null && member.teamId ? `/manager?teamId=${member.teamId}` : "/manager";

  return (
    <main className="min-h-screen bg-slate-50/70 pb-16">
      <DashboardNav />
      <div className="animate-page-enter mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to {member.teamName ?? "team"}
        </Link>

        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {ROLE_LABELS[member.role]}
              {member.teamName && ` · ${member.teamName}`}
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
              {member.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{member.email}</p>
          </div>
          <dl className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="mt-1 font-medium text-slate-900">{member.status === "active" ? "Active" : member.status === "disabled" ? "Disabled" : "Pending"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Last login</dt>
              <dd className="mt-1 font-medium text-slate-900">{formatRelativeTime(member.lastSignInAt)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Last activity</dt>
              <dd className="mt-1 font-medium text-slate-900">{formatRelativeTime(member.lastActivityAt)}</dd>
            </div>
          </dl>
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
          <StatCard label="Jobs Created" value={member.jobs} icon={Briefcase} />
          <StatCard
            label="Sourcing Runs"
            value={`${member.completedRuns} / ${member.runs}`}
            icon={FolderSearch}
           
          />
          <StatCard
            label="Average Match Quality"
            value={
              member.averageMatchQuality !== null
                ? `${member.averageMatchQuality}%`
                : "No evaluated files yet"
            }
            icon={Target}
           
          />
          <StatCard label="Shortlisted" value={member.shortlisted} icon={UserCheck} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="col-span-1 border-slate-200 shadow-sm lg:col-span-2">
            <CardHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <Activity className="h-4 w-4 text-indigo-600" />
                    Candidate Pipeline
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Status of candidates owned by {member.name}
                  </CardDescription>
                </div>
                <Badge tone="neutral">{member.candidates} total</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <PipelineChart counts={pipelineCounts} />
            </CardContent>
          </Card>

          <Card className="col-span-1 border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">
                Performance Overview
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Totals across all of this member&apos;s work
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <dl className="flex flex-col divide-y divide-slate-100 text-sm">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-slate-600">Active sourcing runs</dt>
                  <dd>
                    <Badge tone={member.activeRuns > 0 ? "warning" : "neutral"}>
                      {member.activeRuns}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-slate-600">Completed runs</dt>
                  <dd>
                    <Badge tone="good">{member.completedRuns}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-slate-600">Failed runs</dt>
                  <dd>
                    <Badge tone={member.failedRuns > 0 ? "critical" : "neutral"}>
                      {member.failedRuns}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-slate-600">Total candidates</dt>
                  <dd className="font-medium tabular-nums text-slate-900">{member.candidates}</dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-slate-600">Contacted</dt>
                  <dd className="font-medium tabular-nums text-slate-900">{member.contacted}</dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-slate-600">Rejected</dt>
                  <dd className="font-medium tabular-nums text-slate-900">{member.rejected}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Briefcase className="h-4 w-4 text-indigo-600" />
                Sourcing Files
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Files owned by {member.name}, newest first
              </CardDescription>
            </div>
            <Badge tone="neutral">
              {files.length} {files.length === 1 ? "file" : "files"}
            </Badge>
          </CardHeader>
          <CardContent className="pt-4">
            <TeamSourcingTable rows={files} showOwner={false} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="col-span-1 border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <FolderOpen className="h-4 w-4 text-indigo-600" />
                Recently Opened
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Sourcing files {member.name} opened most recently
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              {recentlyOpened.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No files opened yet.</p>
              ) : (
                <ol className="flex flex-col divide-y divide-slate-100">
                  {recentlyOpened.map((file) => (
                    <li key={file.runId} className="flex items-center justify-between gap-3 py-3">
                      <Link
                        href={`/candidates?jobId=${file.jobId}&runId=${file.runId}`}
                        className="truncate text-sm font-medium text-slate-900 underline-offset-4 hover:text-indigo-700 hover:underline"
                      >
                        {file.jobTitle}
                      </Link>
                      <span className="shrink-0 text-xs text-slate-500">
                        {formatRelativeTime(file.accessedAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-1 border-slate-200 shadow-sm lg:col-span-2">
            <CardHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <History className="h-4 w-4 text-indigo-600" />
                    Recent Activity
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Actions recorded for {member.name}
                  </CardDescription>
                </div>
                {member.averageMatchQuality !== null && (
                  <Badge tone={matchScoreTone(member.averageMatchQuality)}>
                    {member.averageMatchQuality}% avg match
                  </Badge>
                )}
              </div>
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
