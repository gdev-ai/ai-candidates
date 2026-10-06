import { fetchJson, ProviderHttpError } from "@/lib/providers/http";
import { xrayToNaturalLanguage } from "@/lib/search/queryBuilder";
import { SearchProviderError, type SearchProvider } from "@/lib/search/SearchProvider";
import type { SearchHit, SearchPageRequest, SearchPageResult } from "@/types/search";

const ENDPOINT = "https://api.exa.ai/search";
const NUM_RESULTS = 10;

export interface ExaDateRange {
  from?: string | null;
  to?: string | null;
}

export interface ExaPersonProperties {
  name?: string;
  firstName?: string;
  lastName?: string;
  location?: string;
  workHistory?: {
    title?: string | null;
    location?: string | null;
    dates?: ExaDateRange | null;
    company?: { id?: string | null; name?: string | null } | null;
  }[];
  educationHistory?: {
    degree?: string | null;
    dates?: ExaDateRange | null;
    institution?: { id?: string | null; name?: string | null } | null;
  }[];
}

export interface ExaResult {
  id?: string;
  title?: string;
  url?: string;
  text?: string;
  image?: string;
  publishedDate?: string;
  entities?: { id?: string; type?: string; properties?: ExaPersonProperties }[];
}

interface ExaResponse {
  requestId?: string;
  results?: ExaResult[];
  costDollars?: { total?: number };
}

export function exaPersonOf(result: ExaResult): ExaPersonProperties | null {
  return result.entities?.find((e) => e.type === "person")?.properties ?? null;
}

/** The role with no end date (or the most recent start) is the current one. */
export function currentExaRole(person: ExaPersonProperties) {
  const roles = person.workHistory ?? [];
  return (
    roles.find((r) => r.dates && r.dates.from && !r.dates.to) ??
    [...roles].sort((a, b) => (b.dates?.from ?? "").localeCompare(a.dates?.from ?? ""))[0] ??
    null
  );
}

export function mapExaResult(result: ExaResult, index: number): SearchHit | null {
  if (!result.url) return null;
  const person = exaPersonOf(result);
  const role = person ? currentExaRole(person) : null;
  const subtitleParts = [person?.location, role?.title, role?.company?.name].filter(
    (p): p is string => Boolean(p),
  );
  // Exa's text starts with "# Name\n\nHeadline\n\nLocation..." — keep it short.
  const snippet = result.text?.replace(/^#.*\n+/, "").replace(/\s+/g, " ").trim().slice(0, 600);
  return {
    position: index + 1,
    link: result.url,
    title: result.title ?? person?.name ?? null,
    snippet: snippet || null,
    subtitle: subtitleParts.length === 3 ? subtitleParts.join(" · ") : null,
    matchedTerms: [],
    richSnippet: person ? { exa: { id: result.id ?? null, image: result.image ?? null, person } } : null,
  };
}

/**
 * Exa people search: natural-language query, structured work and education
 * history with dates (stored as person_experiences, source 'exa'). One
 * page only.
 */
export class ExaProvider implements SearchProvider {
  readonly name = "exa" as const;
  readonly maxPages = 1;

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("EXA_API_KEY is required for the Exa search provider.");
  }

  async searchPage({ query }: SearchPageRequest): Promise<SearchPageResult> {
    const request = {
      query: xrayToNaturalLanguage(query),
      category: "people",
      numResults: NUM_RESULTS,
      contents: { text: { maxCharacters: 1000 } },
    };
    try {
      const { status, body } = await fetchJson<ExaResponse>("exa", ENDPOINT, {
        method: "POST",
        headers: { "x-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        timeoutMs: 60_000,
      });
      const hits = (body.results ?? [])
        .map(mapExaResult)
        .filter((hit): hit is SearchHit => hit !== null);
      return {
        hits,
        hasNextPage: false,
        totalResults: null,
        credits: null,
        costUsd: body.costDollars?.total ?? null,
        providerRequestId: body.requestId ?? null,
        httpStatus: status,
        request,
        raw: body,
      };
    } catch (error) {
      throw new SearchProviderError("exa", error, {
        httpStatus: error instanceof ProviderHttpError ? error.status : null,
        request,
        raw: error instanceof ProviderHttpError ? error.body : null,
      });
    }
  }
}
