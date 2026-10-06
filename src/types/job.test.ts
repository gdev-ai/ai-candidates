import { describe, expect, it } from "vitest";

import { analysisToDraft, jobCreateSchema, jobUpdateSchema, toSeniority } from "./job";

const COMPANY = "8f14e45f-ceea-4e7a-9f8b-0a1b2c3d4e5f";

describe("jobCreateSchema", () => {
  it("maps empty form values to null and trims", () => {
    const parsed = jobCreateSchema.parse({
      title: "  Engineer ",
      description: "Build things",
      company_id: "",
      city: "",
      employment_type: "",
      work_arrangement: "Hybrid",
      seniority: "",
      min_experience: "",
      max_experience: null,
    });
    expect(parsed).toMatchObject({
      title: "Engineer",
      company_id: null,
      city: null,
      employment_type: null,
      work_arrangement: "Hybrid",
      seniority: null,
      min_experience: null,
      max_experience: null,
      requirements: [],
    });
  });

  it("accepts the DB enum values and requirement rows, dropping blanks and duplicates", () => {
    const parsed = jobCreateSchema.parse({
      title: "Engineer",
      description: "x",
      company_id: COMPANY,
      city: "Giza",
      seniority: "senior",
      min_experience: 2,
      max_experience: 5.5,
      requirements: [
        { kind: "skill_required", text: " React " },
        { kind: "skill_required", text: "react" },
        { kind: "keyword", text: "  " },
        { kind: "language", text: "Arabic" },
      ],
      analysisCallId: "1b4e28ba-2fa1-4d2e-883f-0016d3cca427",
    });
    expect(parsed.requirements).toEqual([
      { kind: "skill_required", text: "React" },
      { kind: "language", text: "Arabic" },
    ]);
    expect(parsed.analysisCallId).toBe("1b4e28ba-2fa1-4d2e-883f-0016d3cca427");
  });

  it("rejects values outside the DB checks", () => {
    const base = { title: "Engineer", description: "x" };
    expect(jobCreateSchema.safeParse({ ...base, city: "Luxor" }).success).toBe(false);
    expect(jobCreateSchema.safeParse({ ...base, seniority: "Senior Lead" }).success).toBe(false);
    expect(jobCreateSchema.safeParse({ ...base, requirements: [{ kind: "skill", text: "x" }] }).success).toBe(false);
    expect(jobCreateSchema.safeParse({ ...base, min_experience: 6, max_experience: 2 }).success).toBe(false);
    expect(jobCreateSchema.safeParse({ ...base, title: " " }).success).toBe(false);
  });

  it("ignores client-sent analysis JSON and location", () => {
    const parsed = jobCreateSchema.parse({
      title: "Engineer",
      description: "x",
      ai_analysis: { job_title: "x" },
      location: "Egypt",
    });
    expect(parsed).not.toHaveProperty("ai_analysis");
    expect(parsed).not.toHaveProperty("location");
  });
});

describe("jobUpdateSchema", () => {
  it("allows partial updates and leaves requirements undefined when not sent", () => {
    const parsed = jobUpdateSchema.parse({ city: "" });
    expect(parsed).toEqual({ city: null });
    expect(parsed.requirements).toBeUndefined();
  });
});

describe("analysisToDraft", () => {
  it("turns analysis lists into requirement rows and normalizes seniority", () => {
    const draft = analysisToDraft({
      job_title: "Dev",
      seniority: "Senior",
      years_of_experience: { minimum: 3, maximum: null },
      required_skills: ["React", " "],
      preferred_skills: ["GraphQL"],
      education: ["BSc"],
      responsibilities: ["Ship"],
    });
    expect(draft).toEqual({
      seniority: "senior",
      city: "",
      min_experience: 3,
      max_experience: null,
      requirements: [
        { kind: "skill_required", text: "React" },
        { kind: "skill_preferred", text: "GraphQL" },
        { kind: "education", text: "BSc" },
        { kind: "responsibility", text: "Ship" },
      ],
    });
  });

  it("leaves unknown seniority blank", () => {
    expect(toSeniority("Principal")).toBe("");
    expect(toSeniority(undefined)).toBe("");
  });
});
