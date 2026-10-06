import { extractLinkedInSlug } from "@/lib/candidates/identity";
import { recordProviderCall } from "@/lib/providers/callLog";
import { SearchProviderError, type SearchProvider } from "@/lib/search/SearchProvider";
import type { Insert, SourcingClient } from "@/lib/supabase/types";
import type { Json } from "@/types/database.types";
import type { SearchLocation, SearchPageResult } from "@/types/search";

export const MAX_PAGES = 3;
const FULL_PAGE = 10;
const MIN_NEW_PROFILES = 3;

/**
 * §8.2 pagination: ask for the next page only if this one was full, the
 * provider says there is more, and it brought at least 3 new /in/ profiles.
 */
export function shouldFetchNextPage(
  result: Pick<SearchPageResult, "hits" | "hasNextPage">,
  newProfileCount: number,
  page: number,
  maxPages: number,
): boolean {
  return (
    page < Math.min(maxPages, MAX_PAGES) &&
    result.hasNextPage &&
    result.hits.length >= FULL_PAGE &&
    newProfileCount >= MIN_NEW_PROFILES
  );
}

export interface RunSearchQueryInput {
  runId: string;
  jobId: string;
  userId: string | null;
  query: string;
  location: SearchLocation;
}

export interface RunSearchQueryResult {
  pages: number;
  hits: number;
  totalResults: number | null;
  error: string | null;
}

/**
 * Runs one query through up to 3 pages. Each page is one provider_calls row
 * plus its search_hits (upserted on run/query/page/position, so a retried
 * step doesn't duplicate rows). A failure on page 1 is returned as the
 * query's error; a failure on a later page just stops paging.
 */
export async function runSearchQuery(
  db: SourcingClient,
  provider: SearchProvider,
  input: RunSearchQueryInput,
): Promise<RunSearchQueryResult> {
  const seenProfiles = new Set<string>();
  let hitCount = 0;
  let totalResults: number | null = null;
  let pagesFetched = 0;

  for (let page = 1; page <= Math.min(provider.maxPages, MAX_PAGES); page++) {
    const startedAt = Date.now();
    let result: SearchPageResult;
    try {
      result = await provider.searchPage({ query: input.query, page, location: input.location });
    } catch (error) {
      const details = error instanceof SearchProviderError ? error.details : {};
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
      if (provider.name !== "mock") {
        await recordProviderCall({
        provider: provider.name,
        purpose: "search",
        status: "error",
        searchRunId: input.runId,
        jobId: input.jobId,
        userId: input.userId,
        httpStatus: details.httpStatus ?? null,
        latencyMs: Date.now() - startedAt,
        error: cause ?? (error instanceof Error ? error.message : String(error)),
        request: details.request ?? { q: input.query, page },
        response: details.raw ?? null,
        });
      }
      const message = `Query "${input.query}" page ${page}: ${cause ?? "search failed"}`;
      return { pages: pagesFetched, hits: hitCount, totalResults, error: page === 1 ? message : null };
    }
    pagesFetched = page;

    // Mock runs are not logged as paid calls (provider_calls has no "mock").
    const callId =
      provider.name === "mock"
        ? null
        : await recordProviderCall({
            provider: provider.name,
            purpose: "search",
            status: result.hits.length > 0 ? "ok" : "empty",
            searchRunId: input.runId,
            jobId: input.jobId,
            userId: input.userId,
            providerRequestId: result.providerRequestId,
            credits: result.credits,
            costUsd: result.costUsd,
            latencyMs: Date.now() - startedAt,
            httpStatus: result.httpStatus,
            request: result.request,
            response: result.raw,
          });

    totalResults ??= result.totalResults;
    if (result.hits.length > 0) {
      const rows: Insert<"search_hits">[] = result.hits.map((hit) => ({
        search_run_id: input.runId,
        provider_call_id: callId,
        query: input.query,
        page,
        position: hit.position,
        link: hit.link,
        title: hit.title,
        snippet: hit.snippet,
        subtitle: hit.subtitle,
        matched_terms: hit.matchedTerms,
        rich_snippet: (hit.richSnippet ?? null) as Json,
      }));
      const { error } = await db
        .from("search_hits")
        .upsert(rows, { onConflict: "search_run_id,query,page,position" });
      if (error) throw error;
      hitCount += rows.length;
    }

    let newProfiles = 0;
    for (const hit of result.hits) {
      const slug = extractLinkedInSlug(hit.link);
      if (slug && !seenProfiles.has(slug)) {
        seenProfiles.add(slug);
        newProfiles++;
      }
    }
    if (!shouldFetchNextPage(result, newProfiles, page, provider.maxPages)) break;
  }

  return { pages: pagesFetched, hits: hitCount, totalResults, error: null };
}
