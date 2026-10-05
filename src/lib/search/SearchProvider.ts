import type {
  SearchPageRequest,
  SearchPageResult,
  SearchProviderName,
} from "@/types/search";

export interface SearchProvider {
  readonly name: SearchProviderName;
  /** Hard page cap for one query (Exa has no pages). */
  readonly maxPages: number;
  searchPage(request: SearchPageRequest): Promise<SearchPageResult>;
}

/**
 * A search call failed. Carries what the call log needs (HTTP status, the
 * request without secrets, the raw error body) so the failure is recorded.
 */
export class SearchProviderError extends Error {
  constructor(
    provider: string,
    cause?: unknown,
    public readonly details: {
      httpStatus?: number | null;
      request?: Record<string, unknown>;
      raw?: unknown;
    } = {},
  ) {
    super(`Search provider "${provider}" failed to return results.`);
    this.name = "SearchProviderError";
    this.cause = cause;
  }
}
