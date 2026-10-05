import { NextResponse } from "next/server";
import { z } from "zod";

import { loadPipelineRow } from "@/app/api/candidates/[id]/_lib/pipeline";
import { requireUser } from "@/lib/api/requireUser";
import { forbidUnlessOwner } from "@/lib/auth/ownership";
import { CANDIDATE_STATUSES } from "@/lib/candidates/statuses";
import { withErrorHandling } from "@/lib/errors";
import { createLogger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const requestSchema = z.object({ status: z.enum(CANDIDATE_STATUSES) });

const log = createLogger("api-candidate-status");

/**
 * PATCH /api/candidates/[personId]/status?jobId=… — moves the candidate
 * along this job's pipeline (owner only). The DB stamps
 * status_changed_at/by and writes candidate.status_changed to the
 * activity log in the same statement, so this route doesn't log it.
 */
export const PATCH = withErrorHandling(async (request: Request, { params }: RouteParams) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: personId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `status must be one of: ${CANDIDATE_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const resolved = await loadPipelineRow(supabase, request, personId);
  if ("error" in resolved) return resolved.error;
  const { row } = resolved;

  const forbidden = forbidUnlessOwner(row.owner_id, user.id, "candidate");
  if (forbidden) return forbidden;

  const pipeline = {
    job_id: row.job_id,
    person_id: row.person_id,
    status: row.status,
    status_changed_at: row.status_changed_at,
  };

  // Re-selecting the current status is a no-op (no write, no log entry).
  if (parsed.data.status === row.status) return NextResponse.json({ pipeline });

  const { data, error } = await supabase
    .from("job_candidates")
    .update({ status: parsed.data.status })
    .eq("job_id", row.job_id)
    .eq("person_id", personId)
    .select("job_id, person_id, status, status_changed_at")
    .maybeSingle();

  if (error) {
    log.error("Failed to update candidate status", { error });
    return NextResponse.json({ error: "Failed to update candidate status." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Candidate not found for this job." }, { status: 404 });

  return NextResponse.json({ pipeline: data });
});
