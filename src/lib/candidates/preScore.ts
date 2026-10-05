import { cosineSimilarity, embedTexts, fromPgVector, toPgVector } from "@/lib/ai/embeddings";
import { isFresh } from "@/lib/enrichment/persist";
import type { SourcingClient } from "@/lib/supabase/types";

export const SHORTLIST_SIZE = 20;
export const UNCERTAIN_EXTRA = 5;
/** Snippets shorter than this tell us too little to trust the pre-score. */
const THIN_SNIPPET_CHARS = 80;

/** Maps embedding cosine similarity (≈0.2–0.7 for this model) onto 0–100. */
export function similarityToScore(similarity: number): number {
  const scaled = ((similarity - 0.2) / 0.5) * 100;
  return Math.round(Math.min(100, Math.max(0, scaled)) * 100) / 100;
}

export function jobEmbeddingText(job: {
  title: string;
  seniority: string | null;
  requirements: { kind: string; text: string }[];
}): string {
  const pick = (kinds: string[]) =>
    job.requirements.filter((r) => kinds.includes(r.kind)).map((r) => r.text).join(", ");
  return [
    `Job title: ${job.title}`,
    job.seniority ? `Seniority: ${job.seniority}` : "",
    `Skills: ${pick(["skill_required", "skill_preferred"])}`,
    `Industry: ${pick(["industry", "keyword"])}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function personEmbeddingText(person: {
  headline: string | null;
  current_title: string | null;
  current_company: string | null;
  about: string | null;
  search_snippet: string | null;
}): string {
  return [
    person.headline,
    person.current_title && `Current role: ${person.current_title}`,
    person.current_company && `Company: ${person.current_company}`,
    person.about ?? person.search_snippet,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ShortlistRow {
  personId: string;
  preScore: number;
  thin: boolean;
  locationVerified: boolean | null;
}

/**
 * Top 20 by pre-score, plus up to 5 more whose score is uncertain because
 * the snippet was thin (§5). Confirmed out-of-country people never qualify.
 */
export function chooseShortlist(
  rows: ShortlistRow[],
  size = SHORTLIST_SIZE,
  extra = UNCERTAIN_EXTRA,
): string[] {
  const eligible = rows
    .filter((r) => r.locationVerified !== false)
    .sort((a, b) => b.preScore - a.preScore);
  const top = eligible.slice(0, size);
  const uncertain = eligible.slice(size).filter((r) => r.thin).slice(0, extra);
  return [...top, ...uncertain].map((r) => r.personId);
}

/**
 * Pre-scores this run's candidates with embeddings (no enrichment cost):
 * job text vs each person's headline/snippet. Writes
 * job_candidates.pre_score, caches the vectors on jobs/people, and returns
 * the shortlist to enrich and match.
 */
export async function preScoreRun(
  db: SourcingClient,
  input: { runId: string; jobId: string; userId: string | null },
): Promise<{ scored: number; shortlist: string[] }> {
  const ctx = { jobId: input.jobId, searchRunId: input.runId, userId: input.userId };
  const { data: job, error: jobError } = await db
    .from("jobs")
    .select("id, title, seniority, embedding, job_requirements(kind, text)")
    .eq("id", input.jobId)
    .single();
  if (jobError) throw jobError;

  let jobVector = fromPgVector(job.embedding);
  if (!jobVector) {
    const [vector] = await embedTexts(
      [jobEmbeddingText({ title: job.title, seniority: job.seniority, requirements: job.job_requirements })],
      ctx,
    );
    jobVector = vector ?? null;
    if (jobVector) await db.from("jobs").update({ embedding: toPgVector(jobVector) }).eq("id", job.id);
  }
  if (!jobVector) return { scored: 0, shortlist: [] };

  const { data: rows, error } = await db
    .from("job_candidates")
    .select(
      "person_id, people!inner(id, headline, current_title, current_company, about, search_snippet, embedding, location_verified, enrichment_status, enriched_at)",
    )
    .eq("job_id", input.jobId)
    .eq("search_run_id", input.runId);
  if (error) throw error;
  const candidates = rows ?? [];
  if (candidates.length === 0) return { scored: 0, shortlist: [] };

  const missing = candidates.filter((r) => !fromPgVector(r.people.embedding));
  const fresh = await embedTexts(missing.map((r) => personEmbeddingText(r.people)), ctx);
  const vectors = new Map<string, number[]>();
  missing.forEach((r, i) => {
    const v = fresh[i];
    if (v) vectors.set(r.person_id, v);
  });
  for (const r of missing) {
    const v = vectors.get(r.person_id);
    if (v) await db.from("people").update({ embedding: toPgVector(v) }).eq("id", r.person_id);
  }

  const shortlistRows: ShortlistRow[] = [];
  const updates: { job_id: string; person_id: string; pre_score: number }[] = [];
  for (const r of candidates) {
    const vector = vectors.get(r.person_id) ?? fromPgVector(r.people.embedding);
    if (!vector) continue;
    const preScore = similarityToScore(cosineSimilarity(jobVector, vector));
    updates.push({ job_id: input.jobId, person_id: r.person_id, pre_score: preScore });
    const text = r.people.about ?? r.people.search_snippet ?? "";
    shortlistRows.push({
      personId: r.person_id,
      preScore,
      thin: !isFresh(r.people) && text.length < THIN_SNIPPET_CHARS,
      locationVerified: r.people.location_verified,
    });
  }
  if (updates.length) {
    const { error: upsertError } = await db
      .from("job_candidates")
      .upsert(updates, { onConflict: "job_id,person_id" });
    if (upsertError) throw upsertError;
  }
  return { scored: updates.length, shortlist: chooseShortlist(shortlistRows) };
}
