import { z } from "zod";

import { runStructured, type CallContext } from "@/lib/ai/structured";
import { countryName } from "@/lib/search/queryBuilder";

export const LOCATION_PROMPT_VERSION = "location-check/2026-10-04";

export const locationVerificationSchema = z.object({
  in_country: z.boolean().nullable(),
  evidence: z.string(),
});
export type LocationVerificationResult = z.infer<
  typeof locationVerificationSchema
>;

export interface LocationVerificationInput {
  name: string | null;
  headline: string | null;
  locationLine: string | null;
  snippet: string | null;
  currentCompany: string | null;
}

function instructions(country: string): string {
  return `Decide whether a LinkedIn profile owner is currently based in ${country}, using only the text given.
Never infer a country from a name, language or the recruiting company. Past jobs' cities in a snippet are weak evidence of where someone lives now.
in_country: true when the current location is explicitly or unambiguously in ${country}; false when it is explicitly elsewhere; null when the text doesn't say. evidence: the words you relied on (empty when null).`;
}

export function buildLocationInput(input: LocationVerificationInput): string {
  return [
    `Name: ${input.name ?? "(unknown)"}`,
    `Headline: ${input.headline ?? "(unknown)"}`,
    `Location line: ${input.locationLine ?? "(none)"}`,
    `Current company: ${input.currentCompany ?? "(unknown)"}`,
    `Search snippet: ${input.snippet ?? "(none)"}`,
  ].join("\n");
}

/**
 * The ambiguous-case tier of the location check (the deterministic tier in
 * lib/candidates/location.ts runs first). Effort none + temperature 0.
 * Skips the call when there is no text at all.
 */
export async function verifyLocationWithAI(
  input: LocationVerificationInput,
  countryCode: string,
  context: CallContext = {},
): Promise<LocationVerificationResult & { callId: string | null }> {
  if (
    !input.headline &&
    !input.snippet &&
    !input.locationLine &&
    !input.currentCompany
  ) {
    return { in_country: null, evidence: "", callId: null };
  }
  const result = await runStructured({
    purpose: "location_check",
    schema: locationVerificationSchema,
    schemaName: "location_check",
    instructions: instructions(countryName(countryCode)),
    input: buildLocationInput(input),
    effort: "none",
    temperature: 0,
    maxOutputTokens: 300,
    promptVersion: LOCATION_PROMPT_VERSION,
    context,
  });
  return { ...result.data, callId: result.callId };
}
