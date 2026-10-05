import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";

interface RouteParams {
  params: Promise<{ runId: string }>;
}

/** Polled by the UI. RLS limits it to runs on jobs the caller can see. */
export const GET = withErrorHandling(async (_request: Request, { params }: RouteParams) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { runId } = await params;

  const { data, error } = await auth.supabase
    .from("search_runs")
    .select("status, error, candidates_found, candidates_new, started_at, completed_at")
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load search run status." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Search run not found." }, { status: 404 });
  return NextResponse.json(data);
});
