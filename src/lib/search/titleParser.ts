import { looksLikeLocation } from "@/lib/candidates/location";
import { BIDI_CHARS } from "@/lib/search/queryBuilder";
import type { ParsedSearchTitle } from "@/types/search";

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.replace(BIDI_CHARS, "").replace(/\s+/g, " ").trim();
  return text || null;
}

/**
 * Splits Serper's `subtitle` ("Cairo, Egypt · Head of Sales · Nozha Beach")
 * or SerpApi's `rich_snippet.top.extensions` ([location, title, company]).
 */
export function parseSubtitleSegments(segments: string[]): {
  location: string | null;
  title: string | null;
  company: string | null;
} {
  const parts = segments.map((s) => clean(s)).filter((s): s is string => Boolean(s));
  if (parts.length >= 3) {
    return { location: parts[0] ?? null, title: parts[1] ?? null, company: parts[2] ?? null };
  }
  if (parts.length === 2) {
    const [first, second] = parts as [string, string];
    return looksLikeLocation(first)
      ? { location: first, title: second, company: null }
      : { location: null, title: first, company: second };
  }
  if (parts.length === 1) {
    const only = parts[0] as string;
    return looksLikeLocation(only)
      ? { location: only, title: null, company: null }
      : { location: null, title: only, company: null };
  }
  return { location: null, title: null, company: null };
}

export function subtitleSegments(subtitle: string | null | undefined): string[] {
  return subtitle ? subtitle.split(/\s+·\s+/) : [];
}

function richSnippetSegments(richSnippet: Record<string, unknown> | null | undefined): string[] {
  const top = richSnippet?.top as { extensions?: unknown } | undefined;
  return Array.isArray(top?.extensions)
    ? top.extensions.filter((e): e is string => typeof e === "string")
    : [];
}

/**
 * Parses a search result into name / headline / company / location (§8.2):
 * 1. strip bidi characters, 2. drop the "| LinkedIn" suffix, 3. split on
 * " - " into name and headline, 4. company from the subtitle / rich snippet,
 * else the text after " at " in the headline (unless truncated with "..."),
 * else a third " - " segment. The headline is free text and is never used
 * as a verified current title.
 */
export function parseSearchTitle(input: {
  title: string | null | undefined;
  subtitle?: string | null;
  richSnippet?: Record<string, unknown> | null;
}): ParsedSearchTitle {
  const title = clean(input.title);
  const structured = parseSubtitleSegments(
    input.subtitle ? subtitleSegments(input.subtitle) : richSnippetSegments(input.richSnippet),
  );

  let name: string | null = null;
  let headline: string | null = null;
  let third: string | null = null;
  if (title) {
    const withoutSuffix = title.replace(/\s*[|\-–]\s*LinkedIn\s*$/i, "").trim();
    const segments = withoutSuffix
      .split(/\s+[-–]\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    name = segments[0] ?? null;
    headline = segments[1] ?? null;
    third = segments[2] ?? null;
  }

  let company = structured.company;
  if (!company && headline) {
    const at = headline.match(/\s(?:at|@)\s+(.+)$/i);
    const candidate = at?.[1]?.trim();
    if (candidate && !/(\.\.\.|…)$/.test(candidate)) company = candidate;
  }
  if (!company && third && !/(\.\.\.|…)$/.test(third)) company = third;

  return {
    name,
    headline: headline ?? structured.title,
    company,
    location: structured.location,
  };
}
