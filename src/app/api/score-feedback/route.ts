import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/api/requireUser";
import { scoreFeedbackRequestSchema } from "@/lib/candidates/scoreFeedback";
import { withErrorHandling } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import type { SourcingClient } from "@/lib/supabase/types";

const log = createLogger("api-score-feedback");

/** RLS: a score on a job the caller can't see reads as not found. */
async function scoreIsVisible(
  supabase: SourcingClient,
  matchId: string,
): Promise<boolean | "error"> {
  const { data, error } = await supabase
    .from("match_results")
    .select("id")
    .eq("id", matchId)
    .maybeSingle();
  if (error) {
    log.error("Failed to load match result", { error });
    return "error";
  }
  return Boolean(data);
}

/**
 * PUT /api/score-feedback — rates one AI score (a match_results row) for
 * the caller: { matchId, rating: "up" | "down", direction?, comment? }.
 * Anyone who can see the job may rate; rating again replaces the rating.
 */
export const PUT = withErrorHandling(async (request: Request) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  const parsed = scoreFeedbackRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid feedback." },
      { status: 400 },
    );
  }
  const { matchId, feedback } = parsed.data;

  const visible = await scoreIsVisible(supabase, matchId);
  if (visible === "error")
    return NextResponse.json(
      { error: "Failed to save feedback." },
      { status: 500 },
    );
  if (!visible)
    return NextResponse.json({ error: "Score not found." }, { status: 404 });

  const { error } = await supabase
    .from("score_feedback")
    .upsert(
      { match_id: matchId, user_id: user.id, ...feedback },
      { onConflict: "match_id,user_id" },
    );
  if (error) {
    log.error("Failed to save score feedback", { error });
    return NextResponse.json(
      { error: "Failed to save feedback." },
      { status: 500 },
    );
  }

  return NextResponse.json({ feedback });
});

/** DELETE /api/score-feedback?matchId=… — clears the caller's rating. */
export const DELETE = withErrorHandling(async (request: Request) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const matchId = new URL(request.url).searchParams.get("matchId");
  if (!matchId || !z.uuid().safeParse(matchId).success) {
    return NextResponse.json(
      { error: "A valid matchId query parameter is required." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("score_feedback")
    .delete()
    .eq("match_id", matchId)
    .eq("user_id", user.id);
  if (error) {
    log.error("Failed to clear score feedback", { error });
    return NextResponse.json(
      { error: "Failed to clear feedback." },
      { status: 500 },
    );
  }

  return NextResponse.json({ feedback: null });
});
