import "server-only";

import { buildSnapshot, readSnapshot, sameSnapshot } from "@/lib/jobs/versions";
import type { SourcingClient } from "@/lib/supabase/types";
import type { Json } from "@/types/database.types";

/**
 * The version a search for this job runs as: the latest one if the job
 * details and requirements are unchanged since, otherwise a new version
 * (N+1) snapshotting them. Service-role client: versions are server-written.
 */
export async function ensureJobVersion(
  db: SourcingClient,
  jobId: string,
  userId: string | null,
): Promise<{ id: string; version: number }> {
  const [jobResult, reqResult, latestResult] = await Promise.all([
    db
      .from("jobs")
      .select(
        "title, description, company_id, employment_type, work_arrangement, seniority, city, country_code, min_experience, max_experience",
      )
      .eq("id", jobId)
      .single(),
    db
      .from("job_requirements")
      .select("kind, text")
      .eq("job_id", jobId)
      .order("sort_order")
      .order("created_at"),
    db
      .from("job_versions")
      .select("id, version, snapshot")
      .eq("job_id", jobId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (jobResult.error) throw jobResult.error;
  if (reqResult.error) throw reqResult.error;
  if (latestResult.error) throw latestResult.error;

  const snapshot = buildSnapshot(jobResult.data, reqResult.data ?? []);
  const latest = latestResult.data;
  if (latest && sameSnapshot(readSnapshot(latest.snapshot), snapshot)) {
    return { id: latest.id, version: latest.version };
  }

  // Two searches started at once may race for N+1: the loser re-reads.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: top } = await db
      .from("job_versions")
      .select("id, version, snapshot")
      .eq("job_id", jobId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (top && sameSnapshot(readSnapshot(top.snapshot), snapshot))
      return { id: top.id, version: top.version };
    const version = (top?.version ?? 0) + 1;
    const { data, error } = await db
      .from("job_versions")
      .insert({
        job_id: jobId,
        version,
        snapshot: snapshot as unknown as Json,
        created_by: userId,
      })
      .select("id, version")
      .single();
    if (!error && data) return data;
    if (error?.code !== "23505") throw error;
  }
  throw new Error("Could not record the job version.");
}
