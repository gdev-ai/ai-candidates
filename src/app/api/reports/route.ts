import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity/log";
import { requireRole } from "@/lib/auth/roles";
import {
  parseDateRange,
  singleParam,
  type SearchParams,
} from "@/lib/dates/dateRange";
import { withErrorHandling } from "@/lib/errors";
import { parseUuid } from "@/lib/manager/filters";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { generateReport, ReportLoadError } from "@/lib/reports/generateReport";
import { resolveReportScope } from "@/lib/reports/scope";
import {
  EXPORT_FORMATS,
  reportFileName,
  reportToCsv,
  reportToXlsx,
  type ExportFormat,
} from "@/lib/reports/serialize";
import { parseReportType } from "@/lib/reports/types";

/**
 * GET /api/reports?type=performance|activity|pipeline|quality
 *   &range=today|7d|30d|90d|all|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   &teamId=<uuid, admins only>&format=json|csv|xlsx
 *
 * Scope comes from the caller's role, never from the request: an HR User
 * always gets their own work, an HR Manager their own team (teamId is
 * ignored), an admin the org or a chosen team.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(["admin", "hr_manager", "hr_user"]);
  if ("error" in auth) return auth.error;
  const { user, supabase, member } = auth;

  const url = new URL(request.url);
  const params: SearchParams = Object.fromEntries(url.searchParams.entries());

  const type = parseReportType(singleParam(params, "type"));
  if (!type) {
    return NextResponse.json(
      {
        error: "type must be one of: performance, activity, pipeline, quality",
      },
      { status: 400 },
    );
  }

  const rawFormat = singleParam(params, "format") ?? "json";
  const format =
    rawFormat === "json"
      ? "json"
      : EXPORT_FORMATS.find((value) => value === rawFormat);
  if (!format) {
    return NextResponse.json(
      { error: "format must be one of: json, csv, xlsx" },
      { status: 400 },
    );
  }

  if (format !== "json") {
    await enforceRateLimit(
      `export:${user.id}`,
      RATE_LIMITS.export.limit,
      RATE_LIMITS.export.windowSeconds,
    );
  }

  const selection = parseDateRange(params, "30d");
  const { scope } = await resolveReportScope(
    supabase,
    member,
    parseUuid(singleParam(params, "teamId")),
  );

  let report;
  try {
    report = await generateReport(supabase, type, scope, selection);
  } catch (error) {
    if (error instanceof ReportLoadError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }

  if (format === "json") {
    return NextResponse.json(report);
  }

  await logActivity(supabase, {
    userId: user.id,
    action: "report.exported",
    entityType: "report",
    description: `Exported the ${report.title} report (${report.scopeLabel}, ${report.rangeLabel}) as ${format.toUpperCase()}`,
    metadata: {
      type,
      format,
      scope: scope.kind,
      teamId: scope.teamId,
      range: { range: selection.range, from: selection.from, to: selection.to },
    },
  });

  const fileName = reportFileName(report, format as ExportFormat);
  const body = format === "csv" ? reportToCsv(report) : reportToXlsx(report);
  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type":
        format === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
});
