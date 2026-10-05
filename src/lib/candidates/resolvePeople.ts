import {
  canonicalLinkedInUrl,
  extractLinkedInSlug,
  identityKey,
  isIndividualProfileUrl,
  isOwnCompany,
} from "@/lib/candidates/identity";
import { classifyLocationText } from "@/lib/candidates/location";
import { mapExaPerson } from "@/lib/enrichment/mapExa";
import { isFresh, writeEnrichedProfile } from "@/lib/enrichment/persist";
import type { ExaPersonProperties } from "@/lib/search/ExaProvider";
import { parseSearchTitle } from "@/lib/search/titleParser";
import type { Insert, SourcingClient, Update } from "@/lib/supabase/types";

interface HitRow {
  id: string;
  link: string;
  title: string | null;
  snippet: string | null;
  subtitle: string | null;
  rich_snippet: unknown;
  provider_call_id: string | null;
}

export interface ResolvedCandidate {
  key: string;
  hitIds: string[];
  profileUrl: string;
  slug: string | null;
  name: string | null;
  headline: string | null;
  company: string | null;
  location: string | null;
  snippet: string | null;
  exa: ExaPersonProperties | null;
  providerCallId: string | null;
}

/** Groups a run's hits by person identity; the first (best-ranked) hit wins. */
export function groupHits(hits: HitRow[]): ResolvedCandidate[] {
  const byKey = new Map<string, ResolvedCandidate>();
  for (const hit of hits) {
    if (!isIndividualProfileUrl(hit.link)) continue;
    const slug = extractLinkedInSlug(hit.link);
    const key = identityKey({ profileUrl: hit.link });
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      existing.hitIds.push(hit.id);
      existing.snippet ??= hit.snippet;
      continue;
    }
    const rich = (hit.rich_snippet ?? null) as Record<string, unknown> | null;
    const parsed = parseSearchTitle({ title: hit.title, subtitle: hit.subtitle, richSnippet: rich });
    const exa = (rich?.exa as { person?: ExaPersonProperties } | undefined)?.person ?? null;
    byKey.set(key, {
      key,
      hitIds: [hit.id],
      profileUrl: slug ? canonicalLinkedInUrl(slug) : hit.link,
      slug,
      name: parsed.name,
      headline: parsed.headline,
      company: isOwnCompany(parsed.company) ? null : parsed.company,
      location: parsed.location,
      snippet: hit.snippet,
      exa,
      providerCallId: hit.provider_call_id,
    });
  }
  return [...byKey.values()];
}

export interface ResolveSummary {
  found: number;
  linked: number;
  excludedForeign: number;
  personIds: string[];
}

const CHUNK = 200;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Turns a run's search_hits into global people (upsert on identity_key —
 * exact match, no ilike) and job_candidates. Existing people only get empty
 * fields filled, never overwritten. People whose location line is clearly
 * outside the job's country are kept as people but not linked to the job.
 * Idempotent: safe to re-run for the same run.
 */
export async function resolvePeopleForRun(
  db: SourcingClient,
  input: { runId: string; jobId: string; countryCode: string },
): Promise<ResolveSummary> {
  const { data: hits, error } = await db
    .from("search_hits")
    .select("id, link, title, snippet, subtitle, rich_snippet, provider_call_id")
    .eq("search_run_id", input.runId)
    .order("query")
    .order("page")
    .order("position");
  if (error) throw error;
  const candidates = groupHits(hits ?? []);
  if (candidates.length === 0) return { found: 0, linked: 0, excludedForeign: 0, personIds: [] };

  // Insert people we've never seen; existing rows are left alone here.
  const newRows: Insert<"people">[] = candidates.map((c) => ({
    identity_key: c.key,
    profile_url: c.profileUrl,
    linkedin_public_id: c.slug,
    input_slugs: c.slug ? [c.slug] : [],
    full_name: c.name,
    headline: c.headline,
    search_snippet: c.snippet,
    current_company: c.company,
    location_text: c.location,
  }));
  for (const batch of chunks(newRows)) {
    const { error: insertError } = await db
      .from("people")
      .upsert(batch, { onConflict: "identity_key", ignoreDuplicates: true });
    if (insertError) throw insertError;
  }

  const people = new Map<
    string,
    {
      id: string;
      full_name: string | null;
      headline: string | null;
      search_snippet: string | null;
      current_company: string | null;
      location_text: string | null;
      country_code: string | null;
      location_method: string | null;
      enrichment_status: string;
      enriched_at: string | null;
      input_slugs: string[];
    }
  >();
  for (const batch of chunks(candidates.map((c) => c.key))) {
    const { data, error: selectError } = await db
      .from("people")
      .select(
        "id, identity_key, full_name, headline, search_snippet, current_company, location_text, country_code, location_method, enrichment_status, enriched_at, input_slugs",
      )
      .in("identity_key", batch);
    if (selectError) throw selectError;
    for (const row of data ?? []) people.set(row.identity_key, row);
  }

  const toLink: string[] = [];
  let excludedForeign = 0;
  for (const c of candidates) {
    const person = people.get(c.key);
    if (!person) continue;

    // Fill only what's missing.
    const fill: Update<"people"> = {};
    if (!person.full_name && c.name) fill.full_name = c.name;
    if (!person.headline && c.headline) fill.headline = c.headline;
    if (!person.search_snippet && c.snippet) fill.search_snippet = c.snippet;
    if (!person.current_company && c.company) fill.current_company = c.company;
    if (!person.location_text && c.location) fill.location_text = c.location;
    if (c.slug && !person.input_slugs.includes(c.slug)) fill.input_slugs = [...person.input_slugs, c.slug];

    // Deterministic location verdict, unless the provider already gave one.
    let verdict: boolean | null = null;
    if (person.location_method === "provider" && person.country_code) {
      verdict = person.country_code === input.countryCode;
    } else {
      const classified = classifyLocationText(c.location ?? person.location_text, input.countryCode);
      verdict = classified.inCountry;
      if (classified.inCountry !== null) {
        fill.location_verified = classified.inCountry;
        fill.location_method = "deterministic";
        fill.location_evidence = classified.evidence;
      }
    }
    if (Object.keys(fill).length > 0) {
      const { error: updateError } = await db.from("people").update(fill).eq("id", person.id);
      if (updateError) throw updateError;
    }

    if (c.exa && !isFresh(person)) {
      await writeEnrichedProfile(db, person.id, mapExaPerson(c.exa, c.profileUrl), {
        providerCallId: c.providerCallId,
        payload: c.exa,
        partial: true,
      });
    }

    const { error: hitError } = await db.from("search_hits").update({ person_id: person.id }).in("id", c.hitIds);
    if (hitError) throw hitError;

    if (verdict === false) excludedForeign++;
    else toLink.push(person.id);
  }

  const now = new Date().toISOString();
  for (const batch of chunks(toLink)) {
    const { error: linkError } = await db.from("job_candidates").upsert(
      batch.map((personId) => ({
        job_id: input.jobId,
        person_id: personId,
        search_run_id: input.runId,
        found_at: now,
      })),
      // Keep the original run/found_at for people already on this job.
      { onConflict: "job_id,person_id", ignoreDuplicates: true },
    );
    if (linkError) throw linkError;
  }

  return { found: candidates.length, linked: toLink.length, excludedForeign, personIds: toLink };
}
