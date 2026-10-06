import { NextResponse } from "next/server";
import { z } from "zod";

import { loadPipelineRow } from "@/app/api/candidates/[id]/_lib/pipeline";
import { logActivity } from "@/lib/activity/log";
import { requireUser } from "@/lib/api/requireUser";
import { forbidUnlessOwner } from "@/lib/auth/ownership";
import { withErrorHandling } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { getDisplayName } from "@/lib/users/displayName";
import type { CandidateNoteRecord } from "@/types/candidate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const requestSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, "Note cannot be empty.")
    .max(5000, "Note is too long."),
});

const log = createLogger("api-candidate-notes");

/** GET /api/candidates/[personId]/notes?jobId=… — newest first. */
export const GET = withErrorHandling(
  async (request: Request, { params }: RouteParams) => {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { supabase } = auth;
    const { id: personId } = await params;

    const resolved = await loadPipelineRow(supabase, request, personId);
    if ("error" in resolved) return resolved.error;

    const { data, error } = await supabase
      .from("candidate_notes")
      .select(
        "id, note, created_at, author_id, author:members!candidate_notes_author_id_fkey ( email, full_name )",
      )
      .eq("job_id", resolved.row.job_id)
      .eq("person_id", personId)
      .order("created_at", { ascending: false });

    if (error) {
      log.error("Failed to load notes", { error });
      return NextResponse.json(
        { error: "Failed to load notes." },
        { status: 500 },
      );
    }

    const notes: CandidateNoteRecord[] = (data ?? []).map((n) => ({
      id: n.id,
      note: n.note,
      created_at: n.created_at,
      author_id: n.author_id,
      author_name: n.author
        ? getDisplayName(n.author.email, n.author.full_name)
        : null,
    }));
    return NextResponse.json({ notes });
  },
);

/** POST /api/candidates/[personId]/notes?jobId=… — owner of the job only. */
export const POST = withErrorHandling(
  async (request: Request, { params }: RouteParams) => {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { supabase, user, member } = auth;
    const { id: personId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid note." },
        { status: 400 },
      );
    }

    const resolved = await loadPipelineRow(supabase, request, personId);
    if ("error" in resolved) return resolved.error;
    const { row } = resolved;

    const forbidden = forbidUnlessOwner(row.owner_id, user.id, "candidate");
    if (forbidden) return forbidden;

    const { data, error } = await supabase
      .from("candidate_notes")
      .insert({
        job_id: row.job_id,
        person_id: personId,
        author_id: user.id,
        note: parsed.data.note,
      })
      .select("id, note, created_at, author_id")
      .single();

    if (error || !data) {
      log.error("Failed to save note", { error });
      return NextResponse.json(
        { error: "Failed to save note." },
        { status: 500 },
      );
    }

    await logActivity(supabase, {
      userId: user.id,
      action: "candidate.note_added",
      entityType: "candidate",
      entityId: personId,
      description: `Added a note on ${row.person_name ?? "a candidate"}`,
      metadata: { jobId: row.job_id },
    });

    const note: CandidateNoteRecord = {
      ...data,
      author_name: getDisplayName(member.email, member.full_name),
    };
    return NextResponse.json({ note }, { status: 201 });
  },
);
