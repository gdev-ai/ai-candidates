import { serpApiLocation } from "@/lib/candidates/location";
import { fetchJson, ProviderHttpError } from "@/lib/providers/http";
import { SERPAPI_USD_PER_SEARCH } from "@/lib/providers/pricing";
import { SearchProviderError, type SearchProvider } from "@/lib/search/SearchProvider";
import type { SearchHit, SearchPageRequest, SearchPageResult } from "@/types/search";

const ENDPOINT = "https://serpapi.com/search.json";
const PAGE_SIZE = 10;
// A real search took 37 s and was billed after a 15 s client timeout (§8.2).
const TIMEOUT_MS = 75_000;
const NO_RESULTS = /hasn't returned any results/i;

interface SerpApiOrganic {
  position?: number;
  title?: string;
  link?: string;
  snippet?: string;
  snippet_highlighted_words?: string[];
  rich_snippet?: Record<string, unknown>;
}

interface SerpApiResponse {
  search_metadata?: { id?: string };
  search_information?: { total_results?: number };
  organic_results?: SerpApiOrganic[];
  serpapi_pagination?: { next?: string };
  error?: string;
}

export function mapSerpApiOrganic(result: SerpApiOrganic, index: number): SearchHit | null {
  if (!result.link) return null;
  return {
    position: result.position ?? index + 1,
    link: result.link,
    title: result.title ?? null,
    snippet: result.snippet ?? null,
    subtitle: null,
    // Highlighted search terms — kept as matched terms, never as skills.
    matchedTerms: result.snippet_highlighted_words ?? [],
    richSnippet: result.rich_snippet ?? null,
  };
}

/** Fallback search provider (free plan, 250 searches/month). */
export class SerpApiProvider implements SearchProvider {
  readonly name = "serpapi" as const;
  readonly maxPages = 3;

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("SERPAPI_API_KEY is required for the SerpApi search provider.");
  }

  async searchPage({ query, page, location }: SearchPageRequest): Promise<SearchPageResult> {
    const request: Record<string, string> = {
      engine: "google",
      q: query,
      gl: location.countryCode.toLowerCase(),
      hl: "en",
    };
    const canonical = serpApiLocation(location.city, location.countryCode);
    if (canonical) request.location = canonical;
    if (location.countryCode.toUpperCase() === "EG") request.google_domain = "google.com.eg";
    if (page > 1) request.start = String((page - 1) * PAGE_SIZE);

    const url = new URL(ENDPOINT);
    for (const [key, value] of Object.entries(request)) url.searchParams.set(key, value);
    url.searchParams.set("api_key", this.apiKey);

    let status: number;
    let body: SerpApiResponse;
    try {
      ({ status, body } = await fetchJson<SerpApiResponse>("serpapi", url.toString(), {
        method: "GET",
        timeoutMs: TIMEOUT_MS,
      }));
    } catch (error) {
      throw new SearchProviderError("serpapi", error, {
        httpStatus: error instanceof ProviderHttpError ? error.status : null,
        request,
        raw: error instanceof ProviderHttpError ? error.body : null,
      });
    }

    const base = {
      totalResults: body.search_information?.total_results ?? null,
      credits: 1,
      costUsd: SERPAPI_USD_PER_SEARCH,
      providerRequestId: body.search_metadata?.id ?? null,
      httpStatus: status,
      request,
      raw: body,
    };
    // "Google found nothing" arrives as HTTP 200 + error; it's an empty page.
    if (body.error && NO_RESULTS.test(body.error)) {
      return { ...base, hits: [], hasNextPage: false };
    }
    if (body.error) {
      throw new SearchProviderError("serpapi", new Error(body.error), {
        httpStatus: status,
        request,
        raw: body,
      });
    }
    const hits = (body.organic_results ?? [])
      .map(mapSerpApiOrganic)
      .filter((hit): hit is SearchHit => hit !== null);
    return { ...base, hits, hasNextPage: Boolean(body.serpapi_pagination?.next) };
  }
}
