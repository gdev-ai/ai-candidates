import {
  describeDateRange,
  resolveDateWindow,
  type DateRangeSelection,
} from "@/lib/dates/dateRange";
import { toSourcingFileRow } from "@/lib/manager/getTeamDashboardData";
import { loadUserStats } from "@/lib/performance/userStats";
import {
  buildActivityReport,
  buildPerformanceReport,
  buildPipelineReport,
  buildQualityReport,
  type ActivitySummaryRow,
} from "@/lib/reports/builders";
import type { ReportScope } from "@/lib/reports/scope";
import type { Report, ReportType } from "@/lib/reports/types";
import type { SourcingClient } from "@/lib/supabase/types";

function windowArgs(window: { from: string | null; to: string | null }) {
  return {
    ...(window.from ? { p_from: window.from } : {}),
    ...(window.to ? { p_to: window.to } : {}),
  };
}

export class ReportLoadError extends Error {}

/**
 * Loads just the data one report type needs and builds it. Everything is
 * aggregated in Postgres; only per-member / per-file summary rows come back.
 * Every query runs as the caller, so RLS bounds the data even beyond the
 * scope's member list.
 */
export async function generateReport(
  supabase: SourcingClient,
  type: ReportType,
  scope: ReportScope,
  selection: DateRangeSelection,
): Promise<Report> {
  const window = resolveDateWindow(selection);
  const meta = {
    scopeLabel: scope.label,
    rangeLabel: describeDateRange(selection),
    generatedAt: new Date().toISOString(),
  };

  const memberIds = scope.members.map((member) => member.user_id);
  const userStats = await loadUserStats(supabase, { window, userIds: memberIds });
  if (userStats.error) throw new ReportLoadError("Failed to load report statistics.");

  switch (type) {
    case "performance":
      return buildPerformanceReport(scope.members, userStats.stats, meta);

    case "pipeline":
      return buildPipelineReport(scope.members, userStats.stats, meta);

    case "activity": {
      const { data, error } = await supabase.rpc("activity_summary", {
        ...windowArgs(window),
        p_user_ids: memberIds,
      });
      if (error) throw new ReportLoadError("Failed to load activity.");
      return buildActivityReport(
        scope.members,
        userStats.stats,
        (data ?? []).map(
          (row): ActivitySummaryRow => ({ ...row, event_count: Number(row.event_count) }),
        ),
        meta,
      );
    }

    case "quality": {
      if (memberIds.length === 0) return buildQualityReport(scope.members, userStats.stats, [], meta);
      const { data, error } = await supabase.rpc("sourcing_files", {
        ...windowArgs(window),
        p_owner_ids: memberIds,
        p_limit: 500,
      });
      if (error) throw new ReportLoadError("Failed to load sourcing files.");
      return buildQualityReport(scope.members, userStats.stats, (data ?? []).map(toSourcingFileRow), meta);
    }
  }
}
