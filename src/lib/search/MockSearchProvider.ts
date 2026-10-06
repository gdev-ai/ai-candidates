import type { SearchProvider } from "@/lib/search/SearchProvider";
import type { SearchHit, SearchPageRequest, SearchPageResult } from "@/types/search";

/**
 * Deterministic results for local development and tests, shaped like real
 * Serper output (bidi marks, Arabic subtitle, a foreign profile, a company
 * page that must be ignored, a truncated "at ..." headline).
 */
export const MOCK_HITS: SearchHit[] = [
  {
    position: 1,
    link: "https://www.linkedin.com/in/amina-hassan-mock",
    title: "Amina Hassan - Senior React Developer - Nile Software",
    subtitle: "Cairo, Egypt · Senior React Developer · Nile Software",
    snippet: "5+ years building React and TypeScript applications for fintech in Cairo.",
    matchedTerms: [],
    richSnippet: null,
  },
  {
    position: 2,
    link: "https://eg.linkedin.com/in/omar-elsayed-mock",
    title: "Omar El-Sayed‏ - ‏Frontend Engineer at Delta Digital",
    subtitle: null,
    snippet: "Frontend Engineer · Experience: Delta Digital · Location: Giza · 500+ connections.",
    matchedTerms: [],
    richSnippet: null,
  },
  {
    position: 3,
    link: "https://ae.linkedin.com/in/sara-youssef-mock",
    title: "Sara Youssef - React Developer",
    subtitle: "United Arab Emirates · React Developer · Gulf Apps",
    snippet: "React developer based in Dubai.",
    matchedTerms: [],
    richSnippet: null,
  },
  {
    position: 4,
    link: "https://www.linkedin.com/company/nile-software",
    title: "Nile Software | LinkedIn",
    subtitle: null,
    snippet: "Company page.",
    matchedTerms: [],
    richSnippet: null,
  },
  {
    position: 5,
    link: "https://eg.linkedin.com/in/karim-mostafa-mock/en",
    title: "Karim Mostafa - Full Stack Developer at Cairo ...",
    subtitle: "القاهرة مصر · Full Stack Developer · Cairo Labs",
    snippet: "Full stack developer working with React, Node.js and PostgreSQL.",
    matchedTerms: [],
    richSnippet: null,
  },
];

export class MockSearchProvider implements SearchProvider {
  readonly name = "mock" as const;
  readonly maxPages = 1;

  async searchPage({ query, page }: SearchPageRequest): Promise<SearchPageResult> {
    const hits = page === 1 ? MOCK_HITS : [];
    return {
      hits,
      hasNextPage: false,
      totalResults: hits.length,
      credits: 0,
      costUsd: 0,
      providerRequestId: null,
      httpStatus: 200,
      request: { q: query, page },
      raw: { organic: hits },
    };
  }
}
