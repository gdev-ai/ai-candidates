import { describe, expect, it } from "vitest";

import { toOutputSchema } from "@/lib/ai/jsonSchema";
import {
  analysisToRequirements,
  jobAnalysisSchema,
  normalizeSeniority,
  type JobAnalysis,
} from "@/types/job-analysis";
import { matchOutputSchema } from "@/types/matching";

const analysis: JobAnalysis = {
  job_title: "Senior QA Engineer",
  seniority: "senior",
  employment_type: "Full-time",
  required_skills: ["Selenium", " selenium ", "Cypress"],
  preferred_skills: ["ISTQB"],
  years_of_experience: { minimum: 5, maximum: null },
  education: [],
  certifications: [],
  languages: ["English"],
  industries: [],
  keywords: [],
  responsibilities: ["Own test strategy"],
  search_keywords: ["QA Engineer", "Test Engineer"],
  search_queries: [],
};

describe("jobAnalysisSchema", () => {
  it("has no city/location and restricts seniority to the jobs enum", () => {
    expect(Object.keys(jobAnalysisSchema.shape)).not.toContain("city");
    expect(Object.keys(jobAnalysisSchema.shape)).not.toContain("location");
    expect(
      jobAnalysisSchema.safeParse({ ...analysis, seniority: "Senior" }).success,
    ).toBe(false);
    expect(jobAnalysisSchema.safeParse(analysis).success).toBe(true);
  });

  it("converts to a strict JSON schema (every field required)", () => {
    for (const schema of [jobAnalysisSchema, matchOutputSchema]) {
      const out = toOutputSchema(schema) as {
        required: string[];
        properties: Record<string, unknown>;
        additionalProperties: boolean;
      };
      expect(out.additionalProperties).toBe(false);
      expect(out.required.sort()).toEqual(Object.keys(out.properties).sort());
    }
  });
});

describe("analysisToRequirements", () => {
  it("flattens to job_requirements rows, deduped per kind", () => {
    expect(analysisToRequirements(analysis)).toEqual([
      { kind: "skill_required", text: "Selenium" },
      { kind: "skill_required", text: "Cypress" },
      { kind: "skill_preferred", text: "ISTQB" },
      { kind: "language", text: "English" },
      { kind: "responsibility", text: "Own test strategy" },
    ]);
  });
});

describe("normalizeSeniority", () => {
  it("maps free text onto the enum", () => {
    expect(normalizeSeniority("Sr. Engineer")).toBe("senior");
    expect(normalizeSeniority("Mid-level")).toBe("mid");
    expect(normalizeSeniority("Head of Sales")).toBe("director");
    expect(normalizeSeniority("Team Lead")).toBe("lead");
    expect(normalizeSeniority("Sales Manager")).toBe("manager");
    expect(normalizeSeniority("")).toBeNull();
  });
});
