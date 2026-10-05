import { verifyLocationWithAI } from "@/lib/ai/prompts/location-verification";
import { createLogger } from "@/lib/logger";
import type { SourcingClient } from "@/lib/supabase/types";

/** Cost guard: at most this many AI location checks per run. */
export const MAX_AI_LOCATION_CHECKS = 40;
const CONCURRENCY = 3;

const log = createLogger("location-check");

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * AI tier of the location check, for people linked by this run whose
 * location the deterministic tier couldn't decide. A confirmed "elsewhere"
 * unlinks the person from the job only if this run added them and nobody
 * has touched the row yet. Failures are recorded per person, never fatal.
 */
export async function checkAmbiguousLocations(
  db: SourcingClient,
  input: { runId: string; jobId: string; countryCode: string; userId: string | null },
): Promise<{ checked: number; excluded: number; failed: number }> {
  const { data, error } = await db
    .from("job_candidates")
    .select(
      "person_id, status, latest_match_id, people!inner(id, full_name, headline, location_text, search_snippet, current_company, location_verified)",
    )
    .eq("job_id", input.jobId)
    .eq("search_run_id", input.runId)
    .is("people.location_verified", null)
    .limit(MAX_AI_LOCATION_CHECKS);
  if (error) throw error;

  let excluded = 0;
  let failed = 0;
  await mapWithConcurrency(data ?? [], CONCURRENCY, async (row) => {
    const person = row.people;
    try {
      const verdict = await verifyLocationWithAI(
        {
          name: person.full_name,
          headline: person.headline,
          locationLine: person.location_text,
          snippet: person.search_snippet,
          currentCompany: person.current_company,
        },
        input.countryCode,
        { jobId: input.jobId, personId: person.id, searchRunId: input.runId, userId: input.userId },
      );
      if (verdict.in_country === null) return;
      await db
        .from("people")
        .update({
          location_verified: verdict.in_country,
          location_method: "ai",
          location_evidence: verdict.evidence || null,
        })
        .eq("id", person.id)
        .is("location_verified", null);
      if (verdict.in_country === false && row.status === "New" && !row.latest_match_id) {
        await db
          .from("job_candidates")
          .delete()
          .eq("job_id", input.jobId)
          .eq("person_id", person.id)
          .eq("search_run_id", input.runId)
          .eq("status", "New");
        excluded++;
      }
    } catch (err) {
      failed++;
      log.warn("AI location check failed", { personId: person.id, error: err });
    }
  });
  return { checked: data?.length ?? 0, excluded, failed };
}
