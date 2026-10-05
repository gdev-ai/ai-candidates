import { NextResponse } from "next/server";

import { loadJobCandidates, loadJobOwner } from "@/app/api/jobs/_lib/candidates";
import { requireUser } from "@/lib/api/requireUser";
import { filterCandidates, parseCandidateQuery, sortCandidates } from "@/lib/candidates/filterAndSort";
import { withErrorHandling } from "@/lib/errors";
import { buildCandidatesWorkbook, toExportRow, workbookToBuffer } from "@/lib/export/excel";
import { createLogger } from "@/lib/logger";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const log = createLogger("api-job-export");

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "job"
  );
}

/** The job's candidates as .xlsx, honoring the list's current filters/sort. */
export const GET = withErrorHandling(async (request: Request, { params }: RouteParams) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: jobId } = await params;

  await enforceRateLimit(`export:${user.id}`, RATE_LIMITS.export.limit, RATE_LIMITS.export.windowSeconds);

  const { job, error: jobError } = await loadJobOwner(supabase, jobId);
  if (jobError) return NextResponse.json({ error: "Failed to load job." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const [candidatesResult, notesResult] = await Promise.all([
    loadJobCandidates(supabase, jobId, user.id),
    supabase
      .from("candidate_notes")
      .select("person_id, note")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
  ]);
  if (candidatesResult.error || notesResult.error) {
    log.error("Failed to load export data", {
      error: candidatesResult.error ?? notesResult.error,
    });
    return NextResponse.json({ error: "Failed to load candidates for this job." }, { status: 500 });
  }

  const notesByPerson = new Map<string, string[]>();
  for (const n of notesResult.data ?? []) {
    const list = notesByPerson.get(n.person_id) ?? [];
    list.push(n.note);
    notesByPerson.set(n.person_id, list);
  }

  const { filters, sortBy, sortDir } = parseCandidateQuery(new URL(request.url).searchParams);
  const rows = sortCandidates(filterCandidates(candidatesResult.data, filters), sortBy, sortDir).map((c) =>
    toExportRow(c, notesByPerson.get(c.person_id) ?? []),
  );

  const buffer = workbookToBuffer(buildCandidatesWorkbook(rows));
  const filename = `candidates-${slugify(job.title)}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
