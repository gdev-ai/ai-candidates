import "server-only";

import { NextResponse } from "next/server";

import type { createLogger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";
import type { Insert, SourcingClient } from "@/lib/supabase/types";
import { formatResetsIn, type CreditsSnapshot } from "@/lib/usage/credits";
import { getCreditsSnapshot, getUsageWindows } from "@/lib/usage/snapshot";
import { tenantKey } from "@/lib/usage/tenant";

export function limitReached(blocked: {
  reason: string;
  resetsAt: string | null;
}): NextResponse {
  const resets = blocked.resetsAt
    ? ` Resets ${formatResetsIn(blocked.resetsAt)}.`
    : "";
  return NextResponse.json(
    {
      error: `${blocked.reason}${resets}`,
      code: "search_limit",
      resetsAt: blocked.resetsAt,
    },
    { status: 429 },
  );
}

/** The shared credits, or a 429 when no new run can start. */
export async function checkCredits(): Promise<
  { credits: CreditsSnapshot } | { response: NextResponse }
> {
  const credits = await getCreditsSnapshot();
  if (credits.blocked) return { response: limitReached(credits.blocked) };
  return { credits };
}

type RunInsert = Omit<Insert<"search_runs">, "tenant_key" | "status">;

/**
 * Inserts a search_runs row (search or scoring batch) and starts its
 * workflow, under the shared credits: two runs started at once can both
 * pass the first check, so it recounts with this run included and withdraws
 * it if that went over. Responds 202 {run} or an error.
 */
export async function launchRun(
  supabase: SourcingClient,
  credits: CreditsSnapshot,
  row: RunInsert,
  start: (runId: string) => Promise<string>,
  log: ReturnType<typeof createLogger>,
): Promise<NextResponse> {
  const { data: run, error: runError } = await supabase
    .from("search_runs")
    .insert({ ...row, status: "pending", tenant_key: tenantKey() })
    .select("id, status")
    .single();
  if (runError || !run) {
    log.error("Failed to create run", { jobId: row.job_id, error: runError });
    return NextResponse.json(
      { error: "Failed to start the run." },
      { status: 500 },
    );
  }

  const windows = await getUsageWindows(createServiceClient(), credits.limits);
  const over = windows.find((w) => w.used > w.limit);
  if (over) {
    await supabase
      .from("search_runs")
      .update({
        status: "cancelled",
        error: "Search limit reached.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return limitReached({
      reason: "The search limit was just reached.",
      resetsAt: over.resetsAt,
    });
  }

  try {
    const workflowRunId = await start(run.id);
    await supabase
      .from("search_runs")
      .update({ workflow_run_id: workflowRunId })
      .eq("id", run.id);
  } catch (error) {
    log.error("Failed to start workflow", {
      jobId: row.job_id,
      runId: run.id,
      error,
    });
    await supabase
      .from("search_runs")
      .update({
        status: "error",
        error: "Could not start the run.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return NextResponse.json(
      { error: "Failed to start the run." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { run: { id: run.id, status: run.status } },
    { status: 202 },
  );
}
