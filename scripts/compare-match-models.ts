/**
 * Re-scores already-scored candidates with two Claude models side by side,
 * to choose ANTHROPIC_MATCH_MODEL. Read-only for match_results; each call
 * is still logged to provider_calls, so its spend shows up as usual.
 *
 *   npx tsx --env-file=.env.local --conditions=react-server \
 *     scripts/compare-match-models.ts <out.json> [modelA] [modelB]
 */
import { writeFileSync } from "node:fs";

import {
  scoreCandidate,
  type ScoredMatch,
} from "@/lib/ai/prompts/candidate-matching";
import { mapWithConcurrency } from "@/lib/concurrency";
import { loadMatchingJob, loadMatchingPerson } from "@/lib/candidates/match";
import { createServiceClient } from "@/lib/supabase/service";

const JOBS = 5;
const PER_JOB = 4;
const CONCURRENCY = 3;

const [argOut, modelA = "claude-haiku-5-5", modelB = "claude-sonnet-5-5"] =
  process.argv.slice(2);
if (!argOut) {
  console.error("usage: compare-match-models.ts <out.json> [modelA] [modelB]");
  process.exit(1);
}
const outPath: string = argOut;

const db = createServiceClient();

interface Pick {
  jobId: string;
  jobTitle: string;
  personId: string;
  previous: {
    model: string | null;
    match_score: number;
    summary: string | null;
  };
}

/** The most recent scored jobs (one per title), spread across each job's score range. */
async function pickCandidates(): Promise<Pick[]> {
  const { data, error } = await db
    .from("match_results")
    .select("job_id, person_id, model, match_score, summary, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;

  const byJob = new Map<string, typeof data>();
  for (const row of data ?? []) {
    const rows = byJob.get(row.job_id) ?? [];
    // Latest result per person.
    if (!rows.some((r) => r.person_id === row.person_id)) rows.push(row);
    byJob.set(row.job_id, rows);
  }

  const { data: jobs, error: jobsError } = await db
    .from("jobs")
    .select("id, title")
    .in("id", [...byJob.keys()]);
  if (jobsError) throw jobsError;
  const titleById = new Map((jobs ?? []).map((j) => [j.id, j.title]));

  const picks: Pick[] = [];
  const titles = new Set<string>();
  for (const [jobId, rows] of byJob) {
    const title = titleById.get(jobId) ?? jobId;
    if (titles.has(title) || rows.length < PER_JOB) continue;
    titles.add(title);
    const sorted = [...rows].sort(
      (a, b) => Number(b.match_score) - Number(a.match_score),
    );
    for (let i = 0; i < PER_JOB; i++) {
      const row =
        sorted[Math.round((i * (sorted.length - 1)) / (PER_JOB - 1))]!;
      picks.push({
        jobId,
        jobTitle: title,
        personId: row.person_id,
        previous: {
          model: row.model,
          match_score: Number(row.match_score),
          summary: row.summary,
        },
      });
    }
    if (titles.size === JOBS) break;
  }
  return picks;
}

async function callStats(callId: string | null) {
  if (!callId) return null;
  const { data } = await db
    .from("provider_calls")
    .select("cost_usd, latency_ms, prompt_tokens, completion_tokens")
    .eq("id", callId)
    .maybeSingle();
  return data;
}

async function score(
  job: Parameters<typeof scoreCandidate>[0],
  person: Parameters<typeof scoreCandidate>[1],
  model: string,
) {
  try {
    const result: ScoredMatch = await scoreCandidate(job, person, { model });
    return { ok: true as const, result, stats: await callStats(result.callId) };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? `${error.message} ${String(error.cause ?? "")}`
          : String(error),
    };
  }
}

async function main() {
  const picks = await pickCandidates();
  console.log(
    `Scoring ${picks.length} candidates with ${modelA} and ${modelB}…`,
  );

  const results = await mapWithConcurrency(picks, CONCURRENCY, async (pick) => {
    const index = picks.indexOf(pick);
    const job = await loadMatchingJob(db, pick.jobId);
    const person = await loadMatchingPerson(db, pick.personId);
    if (!job || !person) return { ...pick, error: "job or person not found" };
    const [a, b] = await Promise.all([
      score(job, person, modelA),
      score(job, person, modelB),
    ]);
    console.log(
      `${index + 1}/${picks.length} ${pick.jobTitle} · ${person.full_name ?? pick.personId}: ` +
        `prev ${pick.previous.match_score} | ${modelA} ${a.ok ? a.result.match_score : "ERR"} | ${modelB} ${b.ok ? b.result.match_score : "ERR"}`,
    );
    return {
      ...pick,
      person: {
        name: person.full_name,
        headline: person.headline,
        current_title: person.current_title,
      },
      requirements: job.requirements.map((r) => ({
        kind: r.kind,
        text: r.text,
      })),
      [modelA]: a,
      [modelB]: b,
    };
  });

  writeFileSync(
    outPath,
    JSON.stringify(
      { modelA, modelB, at: new Date().toISOString(), results },
      null,
      2,
    ),
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
