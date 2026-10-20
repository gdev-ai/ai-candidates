import { describe, expect, it } from "vitest";

import { toOutputSchema } from "@/lib/ai/jsonSchema";
import { jobAnalysisSchema } from "@/types/job-analysis";
import { matchOutputSchema } from "@/types/matching";

const json = (value: unknown) => JSON.stringify(value);

describe("toOutputSchema", () => {
  it("keeps enums the API enforces", () => {
    const out = json(toOutputSchema(matchOutputSchema));
    expect(out).toContain('"enum":["met","partial","missing"]');
    expect(out).toContain('"enum":["skill_required"');
    expect(json(toOutputSchema(jobAnalysisSchema))).toContain(
      '"enum":["intern"',
    );
  });

  it("moves unsupported constraints into descriptions", () => {
    const out = json(toOutputSchema(matchOutputSchema));
    expect(out).not.toMatch(/"(minimum|maximum|minLength)":/);
    expect(out).toContain("minimum: 0");
  });

  it("closes every object", () => {
    const objects: Record<string, unknown>[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (record.type === "object") objects.push(record);
      Object.values(record).forEach(walk);
    };
    walk(toOutputSchema(matchOutputSchema));
    expect(objects.length).toBe(2);
    for (const o of objects) expect(o.additionalProperties).toBe(false);
  });
});
