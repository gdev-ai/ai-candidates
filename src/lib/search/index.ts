import { env } from "@/lib/env";
import { ExaProvider } from "@/lib/search/ExaProvider";
import { MockSearchProvider } from "@/lib/search/MockSearchProvider";
import { SerpApiProvider } from "@/lib/search/SerpApiProvider";
import { SerperProvider } from "@/lib/search/SerperProvider";
import type { SearchProvider } from "@/lib/search/SearchProvider";
import type { SearchProviderName } from "@/types/search";

/**
 * Builds the provider for a run. A run records its provider when created,
 * and the workflow passes it back here, so a run never switches provider
 * midway. Never silently falls back to mock.
 */
export function getSearchProvider(name: SearchProviderName = env.SEARCH_PROVIDER): SearchProvider {
  switch (name) {
    case "mock":
      return new MockSearchProvider();
    case "serper":
      if (!env.SERPER_API_KEY) throw new Error('SEARCH_PROVIDER is "serper" but SERPER_API_KEY is not set.');
      return new SerperProvider(env.SERPER_API_KEY);
    case "serpapi":
      if (!env.SERPAPI_API_KEY) throw new Error('SEARCH_PROVIDER is "serpapi" but SERPAPI_API_KEY is not set.');
      return new SerpApiProvider(env.SERPAPI_API_KEY);
    case "exa":
      if (!env.EXA_API_KEY) throw new Error('SEARCH_PROVIDER is "exa" but EXA_API_KEY is not set.');
      return new ExaProvider(env.EXA_API_KEY);
    default: {
      const unknown: never = name;
      throw new Error(`Unknown search provider: ${String(unknown)}`);
    }
  }
}

export function configuredSearchProvider(): SearchProviderName {
  return env.SEARCH_PROVIDER;
}

export type { SearchProvider } from "@/lib/search/SearchProvider";
