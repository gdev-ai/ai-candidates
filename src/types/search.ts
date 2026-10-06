/** Search provider names; mirrors search_runs.provider. */
export type SearchProviderName = "mock" | "serper" | "serpapi" | "exa";

/** Where to aim a search: a city (when the job has one) or the whole country. */
export interface SearchLocation {
  countryCode: string;
  city: string | null;
}

export interface SearchPageRequest {
  query: string;
  /** 1-based. */
  page: number;
  location: SearchLocation;
}

/**
 * One organic result, as stored in search_hits. Never carries "skills":
 * highlighted words are kept as matched_terms only.
 */
export interface SearchHit {
  position: number;
  link: string;
  title: string | null;
  snippet: string | null;
  /** Serper `subtitle`, e.g. "Cairo, Egypt · Head of Sales · Nozha Beach". */
  subtitle: string | null;
  matchedTerms: string[];
  richSnippet: Record<string, unknown> | null;
}

export interface SearchPageResult {
  hits: SearchHit[];
  /** Whether the provider says another page exists. */
  hasNextPage: boolean;
  /** Provider-reported total, when it gives one. */
  totalResults: number | null;
  credits: number | null;
  costUsd: number | null;
  providerRequestId: string | null;
  httpStatus: number | null;
  /** Request as sent, minus secrets. */
  request: Record<string, unknown>;
  /** Raw response body. */
  raw: unknown;
}

/** What the title/subtitle parser can tell from a search result. */
export interface ParsedSearchTitle {
  name: string | null;
  /** Free-text headline; never treated as a verified current title. */
  headline: string | null;
  company: string | null;
  location: string | null;
}
