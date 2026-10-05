import { z } from "zod";

import { runStructured, type CallContext } from "@/lib/ai/structured";
import { buildXrayQuery, normalizeQuery } from "@/lib/search/queryBuilder";
import type { SearchLocation } from "@/types/search";

export const QUERY_GEN_PROMPT_VERSION = "query-gen/2026-10-04";

/**
 * The model only picks the ingredients (title synonyms, 0-2 skill phrases
 * per variant). The `site:` operator, quoting and the location group are
 * added in code (§8.2), so the model can no longer emit a literal
 * "Cairo OR Giza" phrase or drop the location.
 */
export const queryVariantsSchema = z.object({
  variants: z
    .array(
      z.object({
        titles: z.array(z.string().min(1)).min(1).max(4),
        skills: z.array(z.string().min(1)).max(2),
      }),
    )
    .min(2)
    .max(4),
});
export type QueryVariants = z.infer<typeof queryVariantsSchema>;

const INSTRUCTIONS = `You help a recruiter find individual LinkedIn profiles with Google X-ray searches.
Return 2-4 variants. Each variant has:
- titles: 1-4 job titles people in this role actually put in their LinkedIn headline (the main title plus common synonyms). Short, 1-4 words each, no seniority words unless they are essential to the role.
- skills: 0-2 short skill phrases (1-3 words) that commonly appear verbatim on such profiles, taken from the requirements. Fewer skills return more results; never use long phrases copied from the job description.
Vary titles and skills across variants so they surface different people, and do not repeat previous queries.
Do not include locations, operators, quotes or site: filters — those are added separately.`;

export interface QueryGenerationInput {
  title: string;
  seniority: string | null;
  alternativeTitles: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  keywords: string[];
  previousQueries: string[];
}

export function buildQueryGenerationInput(input: QueryGenerationInput): string {
  const list = (items: string[]) => (items.length ? items.join(", ") : "(none)");
  return [
    `Job title: ${input.title}`,
    `Seniority: ${input.seniority ?? "(not specified)"}`,
    `Alternative titles: ${list(input.alternativeTitles)}`,
    `Required skills: ${list(input.requiredSkills)}`,
    `Preferred skills: ${list(input.preferredSkills)}`,
    `Keywords: ${list(input.keywords)}`,
    `Previous queries for this job:`,
    input.previousQueries.length ? input.previousQueries.map((q) => `- ${q}`).join("\n") : "(none)",
  ].join("\n");
}

/**
 * Generates X-ray queries for a job: AI picks titles/skills, code builds
 * the query strings, and anything already run for the job is dropped.
 */
export async function generateSearchQueries(
  input: QueryGenerationInput,
  location: SearchLocation,
  context: CallContext = {},
): Promise<{ queries: string[]; callId: string | null }> {
  const result = await runStructured({
    purpose: "query_gen",
    schema: queryVariantsSchema,
    schemaName: "query_variants",
    instructions: INSTRUCTIONS,
    input: buildQueryGenerationInput(input),
    effort: "low",
    maxOutputTokens: 2000,
    promptVersion: QUERY_GEN_PROMPT_VERSION,
    context,
  });

  return {
    queries: variantsToQueries(result.data, location, input.previousQueries),
    callId: result.callId,
  };
}

export function variantsToQueries(
  variants: QueryVariants,
  location: SearchLocation,
  previousQueries: string[] = [],
): string[] {
  const seen = new Set(previousQueries.map(normalizeQuery));
  const queries: string[] = [];
  for (const variant of variants.variants) {
    const query = buildXrayQuery({ titles: variant.titles, skills: variant.skills, location });
    if (!query) continue;
    const key = normalizeQuery(query);
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
  }
  return queries;
}
