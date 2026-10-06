import { fetchJson, ProviderHttpError } from "@/lib/providers/http";
import { SERPER_USD_PER_CREDIT } from "@/lib/providers/pricing";
import { SearchProviderError, type SearchProvider } from "@/lib/search/SearchProvider";
import type { SearchHit, SearchPageRequest, SearchPageResult } from "@/types/search";

const ENDPOINT = "https://google.serper.dev/search";
const PAGE_SIZE = 10;

interface SerperOrganic {
  title?: string;
  subtitle?: string;
  link?: string;
  snippet?: string;
  position?: number;
  attributes?: Record<string, unknown>;
  sitelinks?: unknown;
}

interface SerperResponse {
  organic?: SerperOrganic[];
  credits?: number;
  searchParameters?: Record<string, unknown>;
}

export function mapSerperOrganic(result: SerperOrganic, index: number): SearchHit | null {
  if (!result.link) return null;
  return {
    position: result.position ?? index + 1,
    link: result.link,
    title: result.title ?? null,
    snippet: result.snippet ?? null,
    subtitle: result.subtitle ?? null,
    matchedTerms: [],
    richSnippet: result.attributes ? { attributes: result.attributes } : null,
  };
}

/** Primary search provider (§8.2). Verified live 2026-10-04. */
export class SerperProvider implements SearchProvider {
  readonly name = "serper" as const;
  readonly maxPages = 3;

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("SERPER_API_KEY is required for the Serper search provider.");
  }

  async searchPage({ query, page, location }: SearchPageRequest): Promise<SearchPageResult> {
    const request = {
      q: query,
      gl: location.countryCode.toLowerCase(),
      hl: "en",
      num: PAGE_SIZE,
      page,
    };
    try {
      const { status, body } = await fetchJson<SerperResponse>("serper", ENDPOINT, {
        method: "POST",
        headers: { "X-API-KEY": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        timeoutMs: 30_000,
      });
      const hits = (body.organic ?? [])
        .map(mapSerperOrganic)
        .filter((hit): hit is SearchHit => hit !== null);
      const credits = typeof body.credits === "number" ? body.credits : 1;
      return {
        hits,
        hasNextPage: (body.organic?.length ?? 0) >= PAGE_SIZE,
        totalResults: null,
        credits,
        costUsd: credits * SERPER_USD_PER_CREDIT,
        providerRequestId: null,
        httpStatus: status,
        request,
        raw: body,
      };
    } catch (error) {
      throw new SearchProviderError("serper", error, {
        httpStatus: error instanceof ProviderHttpError ? error.status : null,
        request,
        raw: error instanceof ProviderHttpError ? error.body : null,
      });
    }
  }
}
