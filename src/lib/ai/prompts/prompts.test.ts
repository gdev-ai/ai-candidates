import { describe, expect, it, vi } from "vitest";

import {
  buildMatchInput,
  computeMatchScore,
  requirementRefs,
  toMatchItems,
} from "@/lib/ai/prompts/candidate-matching";
import {
  experienceScore,
  yearsFitScore,
} from "@/lib/ai/prompts/candidate-matching";
import { variantsToQueries } from "@/lib/ai/prompts/search-query-generation";
import type { MatchingJob, MatchingPerson } from "@/types/matching";

vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/providers/callLog", () => ({ recordProviderCall: vi.fn() }));

const job: MatchingJob = {
  id: "job-1",
  title: "QA Engineer",
  description: null,
  seniority: "mid",
  employment_type: "Full-time",
  work_arrangement: "Hybrid",
  city: "Cairo",
  country_code: "EG",
  min_experience: 3,
  max_experience: null,
  requirements: [
    { id: "req-a", kind: "skill_required", text: "Selenium", weight: 1 },
    { id: "req-b", kind: "education", text: "BSc Computer Science", weight: 1 },
  ],
};

const person: MatchingPerson = {
  id: "p1",
  full_name: "Ahmed",
  headline: "QA Engineer at Valeo",
  about: null,
  search_snippet: null,
  current_title: "QA Engineer",
  current_company: "Valeo",
  location_text: "Cairo, Egypt",
  country_code: "EG",
  location_verified: true,
  experience_years: 4.5,
  enriched: true,
  experiences: [
    {
      title: "QA Engineer",
      company: "Valeo",
      location: "Cairo",
      start_year: 2022,
      start_month: 3,
      end_year: null,
      end_month: null,
      is_current: true,
      description: "Selenium automation",
    },
  ],
  education: [
    {
      school: "Cairo University",
      degree: "BSc",
      field_of_study: "CS",
      start_year: 2014,
      end_year: 2018,
    },
  ],
  skills: [{ name: "Selenium", endorsements: 12, is_top: true }],
  certifications: [
    { title: "ISTQB", issuer: "ISTQB", issued_on: "2020-01-01" },
  ],
  languages: [{ name: "English", proficiency: "full_professional" }],
};

describe("candidate matching prompt", () => {
  it("labels requirements R1..Rn and includes the person's full profile", () => {
    const input = buildMatchInput(job, person);
    expect(input).toContain("R1 [skill_required] Selenium");
    expect(input).toContain("R2 [education] BSc Computer Science");
    expect(input).toContain("Location: Cairo, Egypt (Hybrid)");
    expect(input).toContain("QA Engineer at Valeo (03/2022 – present)");
    expect(input).toContain("Selenium (12)");
    expect(input).toContain("Languages: English (full_professional)");
    expect(input).toContain("Certifications: ISTQB");
  });

  it("computes the overall score from weights, rounded to 2 decimals", () => {
    expect(
      computeMatchScore({
        skills_score: 90,
        experience_score: 80,
        seniority_score: 70,
        education_score: 60,
        location_score: 100,
      }),
    ).toBe(82.5);
    expect(
      computeMatchScore({
        skills_score: 33.333,
        experience_score: 33.333,
        seniority_score: 33.333,
        education_score: 33.333,
        location_score: 33.333,
      }),
    ).toBe(33.33);
  });

  it("maps requirement refs back to requirement ids", () => {
    const items = toMatchItems(
      {
        skills_score: 0,
        experience_score: 0,
        location_score: 0,
        education_score: 0,
        seniority_score: 0,
        summary: "",
        items: [
          {
            kind: "skill_required",
            requirement_ref: "r1",
            status: "met",
            text: "Selenium",
            evidence: "Selenium (12)",
          },
          {
            kind: "concern",
            requirement_ref: null,
            status: "missing",
            text: "No ISTQB advanced",
            evidence: "",
          },
          {
            kind: "keyword",
            requirement_ref: "R9",
            status: "partial",
            text: "x",
            evidence: "",
          },
        ],
      },
      requirementRefs(job),
    );
    expect(items[0]).toEqual({
      kind: "skill_required",
      requirement_id: "req-a",
      status: "met",
      text: "Selenium",
      evidence: "Selenium (12)",
    });
    expect(items[1]).not.toHaveProperty("requirement_id");
    expect(items[2]).not.toHaveProperty("requirement_id");
  });
});

describe("variantsToQueries", () => {
  it("builds queries in code and drops ones already run", () => {
    const location = { countryCode: "EG", city: null };
    const queries = variantsToQueries(
      {
        variants: [
          { titles: ["QA Engineer", "Test Engineer"], skills: ["Selenium"] },
          { titles: ["QA Engineer"], skills: [] },
          { titles: ["QA Engineer", "Test Engineer"], skills: ["selenium"] },
        ],
      },
      location,
      ['site:eg.linkedin.com/in "QA Engineer"'],
    );
    expect(queries).toEqual([
      'site:eg.linkedin.com/in ("QA Engineer" OR "Test Engineer") "Selenium"',
    ]);
  });
});

describe("yearsFitScore / experienceScore", () => {
  it("is 100 inside the range and penalises under- more than over-qualification", () => {
    expect(yearsFitScore(8, 7, 10)).toBe(100);
    expect(yearsFitScore(5, 7, 10)).toBe(70);
    expect(yearsFitScore(14, 7, 10)).toBe(84);
    expect(yearsFitScore(30, 7, 10)).toBe(60);
    expect(yearsFitScore(0, 7, 10)).toBe(0);
    expect(yearsFitScore(20, 3, null)).toBe(100);
  });

  it("is null when years or the range are unknown", () => {
    expect(yearsFitScore(null, 7, 10)).toBeNull();
    expect(yearsFitScore(5, null, null)).toBeNull();
  });

  it("averages relevance with years fit, or uses relevance alone", () => {
    expect(experienceScore(90, 60)).toBe(75);
    expect(experienceScore(90, null)).toBe(90);
  });
});
