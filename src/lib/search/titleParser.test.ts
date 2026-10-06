import { describe, expect, it } from "vitest";

import { parseSearchTitle } from "@/lib/search/titleParser";

describe("parseSearchTitle", () => {
  it("uses Serper's subtitle for location, title and company", () => {
    expect(
      parseSearchTitle({
        title: "Mahmoud Jad - HEAD OF SALES",
        subtitle: "Cairo, Egypt · Head of Sales · Nozha Beach",
      }),
    ).toEqual({ name: "Mahmoud Jad", headline: "HEAD OF SALES", company: "Nozha Beach", location: "Cairo, Egypt" });
  });

  it("strips bidi marks from Arabic-locale titles", () => {
    const parsed = parseSearchTitle({ title: "Mohamed Elbehiri‏ - ‏Sales Manager click for trades" });
    expect(parsed.name).toBe("Mohamed Elbehiri");
    expect(parsed.headline).toBe("Sales Manager click for trades");
  });

  it("takes the company after ' at ' unless truncated", () => {
    expect(parseSearchTitle({ title: "Omar - Frontend Engineer at Delta Digital" }).company).toBe("Delta Digital");
    expect(parseSearchTitle({ title: "Mohamed Hassan - Sales Director & Team leader at ..." }).company).toBeNull();
  });

  it("drops the LinkedIn suffix and uses a third segment as company", () => {
    expect(parseSearchTitle({ title: "Sara Ali - QA Engineer - Valeo | LinkedIn" })).toMatchObject({
      name: "Sara Ali",
      headline: "QA Engineer",
      company: "Valeo",
    });
  });

  it("reads SerpApi rich_snippet extensions [location, title, company]", () => {
    expect(
      parseSearchTitle({
        title: "Ahmed Mostafa‏ - ‏Sales Manager Cairo & Alexandria at ...",
        richSnippet: { top: { extensions: ["مصر", "Sales Manager", "Golden Cup"] } },
      }),
    ).toMatchObject({ company: "Golden Cup", location: "مصر" });
  });

  it("handles a two-part subtitle that starts with a place", () => {
    expect(parseSearchTitle({ title: "X - Y", subtitle: "Dubai, United Arab Emirates · Sales Director" })).toMatchObject({
      location: "Dubai, United Arab Emirates",
      company: null,
    });
  });
});
