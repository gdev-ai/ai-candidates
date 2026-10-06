import { describe, expect, it } from "vitest";

import {
  buildXrayQuery,
  cleanTerm,
  countryFromProfileUrl,
  MAX_QUERY_WORDS,
  normalizeQuery,
  xrayToNaturalLanguage,
} from "@/lib/search/queryBuilder";

const egypt = { countryCode: "EG", city: null };
const cairo = { countryCode: "EG", city: "Cairo" };

describe("buildXrayQuery", () => {
  it("quotes each term and uses the /in/ site filter only", () => {
    expect(
      buildXrayQuery({
        titles: ["Sales Manager", "Sales Director"],
        skills: ["Real Estate"],
        location: cairo,
      }),
    ).toBe(
      'site:eg.linkedin.com/in ("Sales Manager" OR "Sales Director") "Real Estate" "Cairo"',
    );
  });

  it("restricts to the country's LinkedIn subdomain instead of quoting the country", () => {
    expect(
      buildXrayQuery({ titles: ["QA Engineer"], skills: [], location: egypt }),
    ).toBe('site:eg.linkedin.com/in "QA Engineer"');
  });

  it("quotes the country when it has no subdomain mapping", () => {
    expect(
      buildXrayQuery({
        titles: ["QA Engineer"],
        skills: [],
        location: { countryCode: "QA", city: null },
      }),
    ).toBe('site:linkedin.com/in "QA Engineer" "QA"');
  });

  it("never emits a literal 'Cairo OR Giza' phrase or /pub", () => {
    const query = buildXrayQuery({
      titles: ['"Accountant" OR "Auditor"'],
      skills: ["site:linkedin.com/pub IFRS"],
      location: egypt,
    }) as string;
    expect(query).not.toContain("/pub");
    expect(query).not.toMatch(/"[^"]* OR [^"]*"/);
    expect(query).toContain('"IFRS"');
  });

  it("caps titles at 4 and skills at 1, dropping long skill phrases", () => {
    const query = buildXrayQuery({
      titles: ["A", "B", "C", "D", "E"],
      skills: ["quality checks and validation reviews", "CAPA", "ISO", "Lean"],
      location: egypt,
    }) as string;
    expect(query).toBe(
      'site:eg.linkedin.com/in ("A" OR "B" OR "C" OR "D") "CAPA"',
    );
  });

  it("stays within 32 words by dropping titles first", () => {
    const longTitle = "Senior Regional Commercial Sales Manager Lead";
    const query = buildXrayQuery({
      titles: [
        longTitle,
        `${longTitle} Two`.slice(0, 40),
        "Head of Regional Sales",
        "Area Sales Manager",
      ],
      skills: ["Real Estate Development", "Key Account Management"],
      location: cairo,
    }) as string;
    expect(query.split(/\s+/).length).toBeLessThanOrEqual(MAX_QUERY_WORDS);
    expect(query.startsWith("site:eg.linkedin.com/in")).toBe(true);
  });

  it("returns null without a usable title", () => {
    expect(
      buildXrayQuery({
        titles: ["  ", '""'],
        skills: ["React"],
        location: egypt,
      }),
    ).toBeNull();
  });

  it("dedupes case-insensitively and strips bidi marks", () => {
    expect(cleanTerm("‏Sales Manager‏")).toBe("Sales Manager");
    expect(
      buildXrayQuery({ titles: ["Dev", "dev"], skills: [], location: egypt }),
    ).toBe('site:eg.linkedin.com/in "Dev"');
  });
});

describe("countryFromProfileUrl", () => {
  it("reads the LinkedIn country subdomain", () => {
    expect(countryFromProfileUrl("https://eg.linkedin.com/in/someone")).toBe(
      "EG",
    );
    expect(countryFromProfileUrl("https://ae.linkedin.com/in/someone")).toBe(
      "AE",
    );
    expect(countryFromProfileUrl("https://uk.linkedin.com/in/someone")).toBe(
      "GB",
    );
    expect(
      countryFromProfileUrl("https://www.linkedin.com/in/someone"),
    ).toBeNull();
    expect(countryFromProfileUrl("https://linkedin.com/in/someone")).toBeNull();
  });
});

describe("xrayToNaturalLanguage", () => {
  it("adds the country from the site subdomain", () => {
    expect(
      xrayToNaturalLanguage(
        'site:eg.linkedin.com/in ("QA Engineer" OR "Tester") "Selenium"',
      ),
    ).toBe("QA Engineer or Tester with Selenium in Egypt");
    expect(
      xrayToNaturalLanguage(
        'site:eg.linkedin.com/in "QA Engineer" "Selenium" "Cairo"',
      ),
    ).toBe("QA Engineer with Selenium in Cairo");
  });

  it("turns an X-ray query into Exa-friendly text", () => {
    expect(
      xrayToNaturalLanguage(
        'site:linkedin.com/in ("Sales Manager" OR "Sales Director") "Real Estate" "Cairo"',
      ),
    ).toBe("Sales Manager or Sales Director with Real Estate in Cairo");
  });
});

describe("normalizeQuery", () => {
  it("ignores case and spacing", () => {
    expect(normalizeQuery('  Site:LinkedIn.com/in  "A"  ')).toBe(
      normalizeQuery('site:linkedin.com/in "a"'),
    );
  });
});
