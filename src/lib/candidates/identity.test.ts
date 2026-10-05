import { describe, expect, it } from "vitest";

import { groupHits } from "@/lib/candidates/resolvePeople";
import {
  extractLinkedInSlug,
  identityKey,
  isIndividualProfileUrl,
  isOwnCompany,
  normalizeUrl,
} from "@/lib/candidates/identity";

describe("extractLinkedInSlug", () => {
  it("normalizes subdomains, locale suffixes, queries and case", () => {
    expect(extractLinkedInSlug("https://eg.linkedin.com/in/Hossam-Shohdy/en")).toBe("hossam-shohdy");
    expect(extractLinkedInSlug("https://www.linkedin.com/in/x/?trk=abc")).toBe("x");
    expect(extractLinkedInSlug("https://www.linkedin.com/in/gina-calbet%C3%B3")).toBe("gina-calbetó");
    expect(extractLinkedInSlug("https://www.linkedin.com/company/acme")).toBeNull();
  });

  it("keeps john and johnsmith distinct (the old ilike prefix bug)", () => {
    expect(identityKey({ profileUrl: "https://linkedin.com/in/john" })).toBe("linkedin:john");
    expect(identityKey({ profileUrl: "https://linkedin.com/in/johnsmith" })).toBe("linkedin:johnsmith");
  });
});

describe("identityKey", () => {
  it("falls back to a normalized URL, then name + company", () => {
    expect(identityKey({ profileUrl: "HTTPS://www.Example.com/p/1/?x=1" })).toBe("url:example.com/p/1");
    expect(identityKey({ name: " Amina  Hassan ", company: "Acme Inc." })).toBe("name-company:amina hassan|acme");
    expect(identityKey({ name: "Only Name" })).toBeNull();
  });
  it("normalizeUrl drops protocol, www, query and trailing slash", () => {
    expect(normalizeUrl("https://www.a.com/b/")).toBe("a.com/b");
  });
});

describe("filters", () => {
  it("rejects company pages and job boards", () => {
    expect(isIndividualProfileUrl("https://www.linkedin.com/company/x")).toBe(false);
    expect(isIndividualProfileUrl("https://wuzzuf.net/jobs/p/1")).toBe(false);
    expect(isIndividualProfileUrl("https://eg.linkedin.com/in/x")).toBe(true);
  });
  it("recognises our own company", () => {
    expect(isOwnCompany("G Developments")).toBe(true);
    expect(isOwnCompany("Other Developments")).toBe(false);
  });
});

describe("groupHits", () => {
  const hit = (id: string, link: string, extra: Partial<{ title: string; subtitle: string; snippet: string }> = {}) => ({
    id,
    link,
    title: extra.title ?? "Name - Title",
    snippet: extra.snippet ?? null,
    subtitle: extra.subtitle ?? null,
    rich_snippet: null,
    provider_call_id: "call",
  });

  it("merges the same profile across subdomains and skips non-profiles", () => {
    const groups = groupHits([
      hit("1", "https://www.linkedin.com/in/amina", { subtitle: "Cairo, Egypt · Dev · Nile" }),
      hit("2", "https://eg.linkedin.com/in/Amina/en"),
      hit("3", "https://www.linkedin.com/company/nile"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: "linkedin:amina",
      hitIds: ["1", "2"],
      profileUrl: "https://www.linkedin.com/in/amina",
      company: "Nile",
      location: "Cairo, Egypt",
    });
  });

  it("never turns the headline into a skill list", () => {
    const [group] = groupHits([hit("1", "https://linkedin.com/in/x", { title: "X - React, Node" })]);
    expect(group).not.toHaveProperty("skills");
  });
});
