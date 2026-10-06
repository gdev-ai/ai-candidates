import { NextResponse } from "next/server";
import { z } from "zod";

import { logActivityOnce } from "@/lib/activity/log";
import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { getDisplayName } from "@/lib/users/displayName";

interface RouteParams {
  params: Promise<{ runId: string }>;
}

// Re-opening the same file within this window refreshes last_accessed_at
// but doesn't add another activity-log entry.
const ACTIVITY_DEDUPE_MS = 30 * 60 * 1000;

const log = createLogger("api-search-run-access");

/**
 * Records that the caller opened this sourcing run's candidate list (one
 * row per run and user, upserted with the latest time) — feeds the
 * dashboard's "Last Accessed By" / "Last Activity". When the opener isn't
 * the file's owner (e.g. their manager), it's also logged as
 * sourcing_file.accessed so it shows up in team views.
 */
export const POST = withErrorHandling(
  async (_request: Request, { params }: RouteParams) => {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { user, supabase } = auth;
    const { runId } = await params;

    if (!z.uuid().safeParse(runId).success) {
      return NextResponse.json(
        { error: "Sourcing run not found." },
        { status: 404 },
      );
    }

    // RLS decides visibility: a run the caller can't read is a 404, so access
    // can't be recorded against (or probe the existence of) someone else's file.
    const { data: run, error: runError } = await supabase
      .from("search_runs")
      .select("id, job:jobs!search_runs_job_id_fkey ( id, owner_id, title )")
      .eq("id", runId)
      .maybeSingle();

    if (runError) {
      log.error("Failed to load search run", { error: runError });
      return NextResponse.json(
        { error: "Failed to load sourcing run." },
        { status: 500 },
      );
    }
    if (!run || !run.job) {
      return NextResponse.json(
        { error: "Sourcing run not found." },
        { status: 404 },
      );
    }

    const { error } = await supabase
      .from("search_run_access")
      .upsert(
        {
          search_run_id: runId,
          user_id: user.id,
          last_accessed_at: new Date().toISOString(),
        },
        { onConflict: "search_run_id,user_id" },
      );
    if (error) {
      log.error("Failed to record run access", { error });
      return NextResponse.json(
        { error: "Failed to record run access." },
        { status: 500 },
      );
    }

    const owner = run.job;
    if (owner.owner_id !== user.id) {
      const { data: ownerMember } = await supabase
        .from("members")
        .select("email, full_name")
        .eq("user_id", owner.owner_id)
        .maybeSingle();
      const ownerName =
        getDisplayName(ownerMember?.email, ownerMember?.full_name) ??
        "a teammate";

      await logActivityOnce(
        supabase,
        {
          userId: user.id,
          action: "sourcing_file.accessed",
          entityType: "search_run",
          entityId: runId,
          description: `Opened ${ownerName}'s sourcing file "${owner.title}"`,
          metadata: { ownerId: owner.owner_id, jobId: owner.id },
        },
        ACTIVITY_DEDUPE_MS,
      );
    }

    return NextResponse.json({ success: true });
  },
);
