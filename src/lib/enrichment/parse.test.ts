import { describe, expect, it } from "vitest";

import {
  experienceYearsFromRanges,
  normalizeLanguageName,
  parseCertificationDates,
  parseEndorsements,
  parseInsightSkills,
  parseLanguageProficiency,
  parseMonth,
} from "@/lib/enrichment/parse";

describe("parse helpers", () => {
  it("parses endorsements to integers", () => {
    expect(parseEndorsements("9 endorsements")).toBe(9);
    expect(parseEndorsements("1 endorsement")).toBe(1);
    expect(parseEndorsements("1,204 endorsements")).toBe(1204);
    expect(parseEndorsements(0)).toBe(0);
    expect(parseEndorsements(undefined)).toBeNull();
  });

  it("parses certification issue/expiry text", () => {
    expect(parseCertificationDates("Issued May 2024 · Expired May 2026")).toEqual({
      issued_on: "2024-05-01",
      expires_on: "2026-05-01",
    });
    expect(parseCertificationDates("Issued Jun 2025")).toEqual({ issued_on: "2025-06-01", expires_on: null });
    expect(parseCertificationDates(null)).toEqual({ issued_on: null, expires_on: null });
  });

  it("maps LinkedIn proficiency labels and language names", () => {
    expect(parseLanguageProficiency("Native or bilingual proficiency")).toBe("native");
    expect(parseLanguageProficiency("Full professional proficiency")).toBe("full_professional");
    expect(parseLanguageProficiency("Professional working proficiency")).toBe("professional_working");
    expect(parseLanguageProficiency("Limited working proficiency")).toBe("limited_working");
    expect(parseLanguageProficiency("Elementary proficiency")).toBe("elementary");
    expect(parseLanguageProficiency("")).toBeNull();
    expect(normalizeLanguageName("العربية")).toBe("ar");
    expect(normalizeLanguageName("English")).toBe("en");
  });

  it("parses months from numbers and names", () => {
    expect(parseMonth(10)).toBe(10);
    expect(parseMonth("Jul")).toBe(7);
    expect(parseMonth("September")).toBe(9);
    expect(parseMonth(13)).toBeNull();
  });

  it("reads skills from supreme_coder insights", () => {
    expect(parseInsightSkills("Skills: Site Supervision · Concrete Works & Finishes · Pumping Stations")).toEqual([
      "Site Supervision",
      "Concrete Works & Finishes",
      "Pumping Stations",
    ]);
  });
});

describe("experienceYearsFromRanges", () => {
  const role = (sy: number, sm: number | null, ey: number | null, em: number | null, current = false) => ({
    start_year: sy,
    start_month: sm,
    end_year: ey,
    end_month: em,
    is_current: current,
  });

  it("does not double count overlapping roles", () => {
    // Jan 2020–Dec 2021 and Jan 2021–Dec 2022 overlap → 3 years, not 4.
    expect(experienceYearsFromRanges([role(2020, 1, 2021, 12), role(2021, 1, 2022, 12)])).toBe(3);
  });

  it("keeps one decimal and runs current roles to now", () => {
    const now = new Date(Date.UTC(2026, 9, 1)); // Oct 2026
    expect(experienceYearsFromRanges([role(2025, 10, null, null, true)], now)).toBe(1.1);
    expect(experienceYearsFromRanges([role(2024, 1, 2024, 6)], now)).toBe(0.5);
  });

  it("returns null without dated roles", () => {
    expect(experienceYearsFromRanges([])).toBeNull();
  });
});
