import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";
import { estimateMinutes } from "@/lib/jobs/runProgress";
import { createServiceClient } from "@/lib/supabase/service";
import { CANDIDATES_PER_RUN } from "@/types/job";

/** Recent finished runs the estimate is measured from. */
const SAMPLE_RUNS = 20;

/**
 * GET /api/search/estimate → { minutes }: how long a search takes, from
 * recent finished runs (every user's: only durations are read). Falls back
 * to 2 minutes.
 */
export const GET = withErrorHandling(async () => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data } = await createServiceClient()
    .from("search_runs")
    .select("started_at, completed_at")
    .eq("status", "complete")
    .eq("max_candidates", CANDIDATES_PER_RUN)
    .not("started_at", "is", null)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(SAMPLE_RUNS);

  const durations = (data ?? []).map(
    (r) =>
      (Date.parse(r.completed_at as string) -
        Date.parse(r.started_at as string)) /
      1000,
  );
  return NextResponse.json({
    minutes: estimateMinutes(durations),
    runs: durations.length,
  });
});
