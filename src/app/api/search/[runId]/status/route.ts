import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";
import type { SourcingClient } from "@/lib/supabase/types";
import {
  RUN_STAGES,
  type LiveCandidate,
  type RunProgress,
  type RunStage,
} from "@/lib/jobs/runProgress";

interface RouteParams {
  params: Promise<{ runId: string }>;
}

function asStage(stage: string | null): RunStage | null {
  return (RUN_STAGES as readonly string[]).includes(stage ?? "")
    ? (stage as RunStage)
    : null;
}

/**
 * Polled by the search loading screen. RLS limits it to runs on jobs the
 * caller can see. Besides the run row it counts live progress: results
 * scanned, people confirmed in-country, profiles enriched and scored, and
 * the best people scored so far.
 */
export const GET = withErrorHandling(
  async (_request: Request, { params }: RouteParams) => {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { supabase } = auth;
    const { runId } = await params;

    const { data: run, error } = await supabase
      .from("search_runs")
      .select(
        "status, stage, error, queries, started_at, completed_at, max_candidates, shortlist_size, enrich_total, candidates_found, candidates_scored, candidates_new, kind, target_person_ids, job_id",
      )
      .eq("id", runId)
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { error: "Failed to load search run status." },
        { status: 500 },
      );
    }
    if (!run)
      return NextResponse.json(
        { error: "Search run not found." },
        { status: 404 },
      );

    const since = run.started_at ?? new Date(0).toISOString();
    if (run.kind === "score") {
      return NextResponse.json(await scoreBatchProgress(supabase, run, since));
    }
    const [hits, linked, enriched, scored] = await Promise.all([
      supabase
        .from("search_hits")
        .select("id", { count: "exact", head: true })
        .eq("search_run_id", runId),
      supabase
        .from("job_candidates")
        .select("person_id", { count: "exact", head: true })
        .eq("search_run_id", runId),
      supabase
        .from("job_candidates")
        .select("person_id, people!inner(id)", { count: "exact", head: true })
        .eq("search_run_id", runId)
        .gte("people.enriched_at", since),
      supabase
        .from("job_candidates")
        .select(
          "person_id, match_score, people!inner(full_name, headline, photo_url)",
        )
        .eq("search_run_id", runId)
        .gte("scored_at", since)
        .order("match_score", { ascending: false }),
    ]);

    const scoredRows = scored.data ?? [];
    const top: LiveCandidate[] = scoredRows
      .slice(0, run.max_candidates ?? 10)
      .map((r) => ({
        personId: r.person_id,
        name: r.people.full_name,
        headline: r.people.headline,
        photoUrl: r.people.photo_url,
        score: Math.round(Number(r.match_score ?? 0)),
      }));

    const body: RunProgress = {
      kind: "search",
      target_count: null,
      status: run.status,
      stage: asStage(run.stage),
      error: run.error,
      started_at: run.started_at,
      completed_at: run.completed_at,
      max_candidates: run.max_candidates,
      queries: run.queries.length,
      profiles_scanned: hits.count ?? 0,
      in_country: linked.count ?? 0,
      shortlist_size: run.shortlist_size,
      enrich_total: run.enrich_total,
      enriched: enriched.count ?? 0,
      scored: scoredRows.length,
      candidates_found: run.candidates_found,
      candidates_scored: run.candidates_scored,
      candidates_new: run.candidates_new,
      top,
    };
    return NextResponse.json(body);
  },
);

type RunRow = {
  status: string;
  stage: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  max_candidates: number | null;
  enrich_total: number | null;
  candidates_scored: number | null;
  target_person_ids: string[] | null;
  job_id: string;
};

/** A scoring batch's progress: its own people, read and scored. */
async function scoreBatchProgress(
  supabase: SourcingClient,
  run: RunRow,
  since: string,
): Promise<RunProgress> {
  const targets = run.target_person_ids ?? [];
  const [enriched, scored] = await Promise.all([
    supabase
      .from("job_candidates")
      .select("person_id, people!inner(id)", { count: "exact", head: true })
      .eq("job_id", run.job_id)
      .in("person_id", targets)
      .gte("people.enriched_at", since),
    supabase
      .from("job_candidates")
      .select(
        "person_id, match_score, people!inner(full_name, headline, photo_url)",
      )
      .eq("job_id", run.job_id)
      .in("person_id", targets)
      .gte("scored_at", since)
      .order("match_score", { ascending: false }),
  ]);
  const scoredRows = scored.data ?? [];
  return {
    kind: "score",
    target_count: targets.length,
    target_person_ids: targets,
    status: run.status,
    stage: asStage(run.stage),
    error: run.error,
    started_at: run.started_at,
    completed_at: run.completed_at,
    max_candidates: run.max_candidates,
    queries: 0,
    profiles_scanned: 0,
    in_country: 0,
    shortlist_size: targets.length,
    enrich_total: run.enrich_total,
    enriched: enriched.count ?? 0,
    scored: scoredRows.length,
    candidates_found: 0,
    candidates_scored: run.candidates_scored,
    candidates_new: 0,
    top: scoredRows.map((r) => ({
      personId: r.person_id,
      name: r.people.full_name,
      headline: r.people.headline,
      photoUrl: r.people.photo_url,
      score: Math.round(Number(r.match_score ?? 0)),
    })),
  };
}
