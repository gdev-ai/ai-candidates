import { afterEach, describe, expect, it, vi } from "vitest";

import { ExaProvider, mapExaResult } from "@/lib/search/ExaProvider";
import { SerpApiProvider } from "@/lib/search/SerpApiProvider";
import { SerperProvider } from "@/lib/search/SerperProvider";
import { shouldFetchNextPage } from "@/lib/search/runSearch";

import serperLive from "./__fixtures__/serper-live.json";

vi.mock("@/lib/providers/callLog", () => ({ recordProviderCall: vi.fn(async () => "call-id") }));

const cairo = { countryCode: "EG", city: "Cairo" };

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("SerperProvider", () => {
  it("maps the live response and reports credits as cost", async () => {
    const fetchFn = mockFetch(serperLive);
    const result = await new SerperProvider("key").searchPage({ query: "q", page: 1, location: cairo });
    expect(result.hits).toHaveLength(10);
    expect(result.hits[0]).toMatchObject({
      position: 1,
      link: "https://www.linkedin.com/in/mahmoudjad",
      subtitle: "Cairo, Egypt · Head of Sales · Nozha Beach",
      matchedTerms: [],
    });
    expect(result.credits).toBe(1);
    expect(result.costUsd).toBeCloseTo(0.001);
    expect(result.hasNextPage).toBe(true);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ q: "q", gl: "eg", hl: "en", num: 10, page: 1 });
    expect(result.request).not.toHaveProperty("X-API-KEY");
  });
});

describe("SerpApiProvider", () => {
  it("sends canonical location and hl=en, never the key in the logged request", async () => {
    const fetchFn = mockFetch({ search_metadata: { id: "abc" }, organic_results: [] });
    const result = await new SerpApiProvider("secret").searchPage({ query: "q", page: 2, location: cairo });
    const url = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get("location")).toBe("Cairo,Cairo Governorate,Egypt");
    expect(url.searchParams.get("hl")).toBe("en");
    expect(url.searchParams.get("start")).toBe("10");
    expect(result.request).not.toHaveProperty("api_key");
    expect(result.providerRequestId).toBe("abc");
  });

  it("treats Google's no-results error as an empty page", async () => {
    mockFetch({ error: "Google hasn't returned any results for this query." });
    const result = await new SerpApiProvider("k").searchPage({ query: "q", page: 1, location: cairo });
    expect(result.hits).toEqual([]);
  });

  it("keeps highlighted words as matched terms, not skills", async () => {
    mockFetch({
      organic_results: [{ position: 1, link: "https://eg.linkedin.com/in/x", title: "X - Y", snippet_highlighted_words: ["Sales"] }],
    });
    const result = await new SerpApiProvider("k").searchPage({ query: "q", page: 1, location: cairo });
    expect(result.hits[0]?.matchedTerms).toEqual(["Sales"]);
  });
});

describe("ExaProvider", () => {
  it("maps a person result with work history into a hit", async () => {
    const hit = mapExaResult(
      {
        url: "https://www.linkedin.com/in/islam-hafez-534694a8",
        title: "Islam Hafez",
        text: "# Islam Hafez\n\nSales Director | Real Estate\n\nCairo, Egypt",
        entities: [
          {
            type: "person",
            properties: {
              name: "Islam Hafez",
              location: "Cairo, Cairo, Egypt",
              workHistory: [{ title: "Sales Director", dates: { from: "2026-05-01", to: null }, company: { name: "Acme" } }],
            },
          },
        ],
      },
      0,
    );
    expect(hit).toMatchObject({ position: 1, subtitle: "Cairo, Cairo, Egypt · Sales Director · Acme" });
    expect(hit?.snippet).toBe("Sales Director | Real Estate Cairo, Egypt");
  });

  it("sends a natural-language people query and reports Exa's cost", async () => {
    const fetchFn = mockFetch({ requestId: "r1", results: [], costDollars: { total: 0.007 } });
    const result = await new ExaProvider("k").searchPage({
      query: 'site:linkedin.com/in "QA Engineer" "Cairo"',
      page: 1,
      location: cairo,
    });
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ query: "QA Engineer in Cairo", category: "people" });
    expect(result.costUsd).toBe(0.007);
  });
});

describe("shouldFetchNextPage", () => {
  const full = { hits: new Array(10).fill(null), hasNextPage: true };
  it("pages only when full, more exist and ≥3 new profiles", () => {
    expect(shouldFetchNextPage(full, 3, 1, 3)).toBe(true);
    expect(shouldFetchNextPage(full, 2, 1, 3)).toBe(false);
    expect(shouldFetchNextPage({ ...full, hits: new Array(9).fill(null) }, 9, 1, 3)).toBe(false);
    expect(shouldFetchNextPage({ ...full, hasNextPage: false }, 9, 1, 3)).toBe(false);
  });
  it("stops at page 3", () => {
    expect(shouldFetchNextPage(full, 10, 3, 3)).toBe(false);
  });
});
