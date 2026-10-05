import type { Json } from "@/types/database.types";

type JsonObject = { [key: string]: Json | undefined };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObject(text: unknown): JsonObject | null {
  if (typeof text !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Pulls the parsed job analysis out of a provider_calls.response payload.
 * Accepts, in order: an `output_parsed` object, an `output_text` JSON
 * string, the Responses API `output[].content[]` text parts, or a response
 * that already is the analysis object. Returns null when nothing usable is
 * there — the caller then refuses the analysisCallId rather than store junk.
 */
export function extractAnalysisOutput(response: Json | null | undefined): JsonObject | null {
  if (!isObject(response)) return null;

  if (isObject(response.output_parsed)) return response.output_parsed;

  const fromText = parseObject(response.output_text);
  if (fromText) return fromText;

  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (!isObject(item) || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (!isObject(part)) continue;
        if (isObject(part.parsed)) return part.parsed;
        const parsed = parseObject(part.text);
        if (parsed) return parsed;
      }
    }
    return null;
  }

  // Already the analysis itself (no Responses API envelope).
  if ("job_title" in response || "required_skills" in response) return response;
  return null;
}
