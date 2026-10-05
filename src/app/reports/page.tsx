import { FileBarChart } from "lucide-react";
import { DashboardNav } from "@/components/dashboard/nav";
import { ReportControls } from "@/components/reports/report-controls";
import { ReportView } from "@/components/reports/report-view";
import { logActivityOnce } from "@/lib/activity/log";
import { requirePageMember } from "@/lib/dashboard/session";
import { parseDateRange, singleParam, type SearchParams } from "@/lib/dates/dateRange";
import { parseUuid } from "@/lib/manager/filters";
import { generateReport, ReportLoadError } from "@/lib/reports/generateReport";
import { resolveReportScope } from "@/lib/reports/scope";
import { parseReportType, type Report } from "@/lib/reports/types";

const VIEW_LOG_WINDOW_MS = 10 * 60 * 1000;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { supabase, user, member } = await requirePageMember();

  const type = parseReportType(singleParam(params, "type")) ?? "performance";
  const selection = parseDateRange(params, "30d");
  const { scope, teamOptions } = await resolveReportScope(
    supabase,
    member,
    parseUuid(singleParam(params, "teamId")),
  );

  let report: Report | null = null;
  let loadError: string | null = null;
  try {
    report = await generateReport(supabase, type, scope, selection);
  } catch (error) {
    if (!(error instanceof ReportLoadError)) throw error;
    loadError = "This report couldn't be generated. Try again in a moment.";
  }

  if (report) {
    await logActivityOnce(
      supabase,
      {
        userId: user.id,
        action: "report.viewed",
        entityType: "report",
        description: `Viewed the ${report.title} report (${report.scopeLabel}, ${report.rangeLabel})`,
        metadata: { type, scope: scope.kind, teamId: scope.teamId, range: { range: selection.range, from: selection.from, to: selection.to } },
      },
      VIEW_LOG_WINDOW_MS,
    );
  }

  const scopeHint =
    scope.kind === "org"
      ? "Admin view: every user in the organization."
      : scope.kind === "team"
        ? `Everyone in ${scope.label}.`
        : "Your own work only.";

  return (
    <main className="min-h-screen bg-slate-50/70 pb-16">
      <DashboardNav />
      <div className="animate-page-enter mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
            <FileBarChart className="h-3.5 w-3.5" aria-hidden="true" />
            {scope.label}{report?.rangeLabel ? ` · ${report.rangeLabel}` : ""}
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            {report ? `${report.title} Report` : "Reports"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {report?.description} {scopeHint}
          </p>
        </div>

        <ReportControls
          type={type}
          selection={selection}
          teamId={scope.kind === "team" && teamOptions ? scope.teamId : null}
          teamOptions={teamOptions}
        />

        {loadError && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <p role="alert" className="text-sm font-medium text-red-800">
              {loadError}
            </p>
          </div>
        )}

        {report && <ReportView report={report} />}
      </div>
    </main>
  );
}
