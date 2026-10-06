import { ArrowRight, Briefcase, Plus, UserCheck, Target, Users, Activity, Clock } from "lucide-react";
import Link from "next/link";

import { DashboardNav } from "@/components/dashboard/nav";
import { PipelineChart } from "@/components/dashboard/pipeline-chart";
import { ScoreDistributionChart } from "@/components/dashboard/score-distribution-chart";
import { SourcingTable } from "@/components/dashboard/sourcing-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { TodaysCandidates } from "@/components/dashboard/todays-candidates";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDashboardData } from "@/lib/dashboard/getDashboardData";
import { requirePageMember } from "@/lib/dashboard/session";

const RECENT_FILES_LIMIT = 5;

const GETTING_STARTED_STEPS = [
  { title: "Upload Job Spec", description: "Paste text or upload PDF/DOCX to extract key skills." },
  { title: "Review Criteria", description: "Review, customize and refine extracted requirements." },
  { title: "Run Sourcing", description: "Automated queries search authorized providers." },
  { title: "Score & Export", description: "Multi-factor match breakdown and Excel export." },
];

export default async function DashboardPage() {
  const { supabase, user } = await requirePageMember();

  const {
    totalJobs,
    totalCandidates,
    shortlistedCandidates,
    averageMatchQuality,
    pipelineCounts,
    unifiedRows,
    scoreBuckets,
    todaysCandidatesCount,
    todaysCandidates,
    loadError,
  } = await getDashboardData(supabase, user.id);

  return (
    <main className="min-h-screen bg-slate-50/70 pb-16">
      <DashboardNav />
      <div className="animate-page-enter mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
        
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Your sourcing activity and candidate pipeline at a glance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/candidates">
                <Users className="mr-2 h-4 w-4" aria-hidden="true" />
                Browse Candidates
              </Link>
            </Button>
            <Button asChild>
              <Link href="/jobs/new">
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                New Job Opening
              </Link>
            </Button>
          </div>
        </div>

        {/* First-run guide: only shown until the first job exists */}
        {totalJobs === 0 && !loadError && (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">
                Get started with your first sourcing file
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Four steps from a job description to a scored, exportable shortlist.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="grid grid-cols-1 gap-4 md:grid-cols-4">
                {GETTING_STARTED_STEPS.map((step, index) => (
                  <li key={step.title} className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-semibold text-indigo-600">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Button asChild className="mt-5">
                <Link href="/jobs/new">
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Create your first job
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {loadError && (
          <div className="rounded-xl bg-red-50 p-4 border border-red-200 shadow-sm flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <p role="alert" className="text-sm font-medium text-red-800">
              {loadError}
            </p>
          </div>
        )}

        {/* Core Metrics */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active Jobs" value={totalJobs} icon={Briefcase} href="/jobs" />
          <StatCard
            label="Total Candidates"
            value={totalCandidates}
            icon={Users}
           
            href="/candidates"
          />
          <StatCard
            label="Average Match Quality"
            value={averageMatchQuality !== null ? `${averageMatchQuality}%` : "—"}
            hint={averageMatchQuality === null ? "No evaluated candidates yet" : undefined}
            icon={Target}
           
          />
          <StatCard
            label="Shortlisted Talent"
            value={shortlistedCandidates}
            icon={UserCheck}
           
            href="/candidates"
          />

        </div>

        {/* Sourcing Files */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Briefcase className="h-4 w-4 text-indigo-600" />
                Sourcing Files
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Your most recent job requisitions and their sourcing runs
              </CardDescription>
            </div>
            {unifiedRows.length > RECENT_FILES_LIMIT && (
              <Button asChild size="sm" variant="outline">
                <Link href="/jobs">
                  View all
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-4">
            <SourcingTable rows={unifiedRows.slice(0, RECENT_FILES_LIMIT)} />
          </CardContent>
        </Card>

        {/* Today's Searched Candidates */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Clock className="h-4 w-4 text-indigo-600" />
                Today&apos;s Searched Candidates
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Candidates you&apos;ve sourced so far today
              </CardDescription>
            </div>
            <Badge tone={todaysCandidatesCount > 0 ? "good" : "neutral"}>
              {todaysCandidatesCount} today
            </Badge>
          </CardHeader>
          <CardContent className="pt-4">
            <TodaysCandidates candidates={todaysCandidates} />
          </CardContent>
        </Card>

        {/* Charts Section */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="col-span-1 lg:col-span-2 shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <Activity className="h-4 w-4 text-indigo-600" />
                    Candidate Pipeline Stages
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Real-time status breakdown across your sourcing jobs
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <PipelineChart counts={pipelineCounts} />
            </CardContent>
          </Card>

          <Card className="col-span-1 shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Match Score Distribution
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    AI evaluation scores (0–100%)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <ScoreDistributionChart buckets={scoreBuckets} />
            </CardContent>
          </Card>
        </div>

      </div>
    </main>
  );
}


