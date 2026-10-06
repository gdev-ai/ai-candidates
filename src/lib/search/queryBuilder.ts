import type { SearchLocation } from "@/types/search";

/** Google ignores everything after the 32nd word. */
export const MAX_QUERY_WORDS = 32;
const MAX_TITLES = 4;
const MAX_SKILLS = 1;
const MAX_SKILL_WORDS = 3;
const MAX_TITLE_WORDS = 6;

/**
 * LinkedIn serves each member's public profile on their country's
 * subdomain (eg.linkedin.com/in/...), so filtering on it keeps results in
 * the job's country far better than a quoted "Egypt" keyword, which also
 * matches people abroad who merely mention it.
 */
const COUNTRY_SUBDOMAINS: Record<string, string> = {
  EG: "eg",
  AE: "ae",
  SA: "sa",
};

export function siteFilter(countryCode: string): string {
  const sub = COUNTRY_SUBDOMAINS[countryCode.toUpperCase()];
  return sub ? `site:${sub}.linkedin.com/in` : "site:linkedin.com/in";
}

/** Country code for a LinkedIn profile URL's subdomain (eg. → EG), if known. */
export function countryFromProfileUrl(url: string): string | null {
  const match = /^https?:\/\/([a-z]{2})\.linkedin\.com\//i.exec(url.trim());
  if (!match) return null;
  const sub = (match[1] as string).toLowerCase();
  if (sub === "www") return null;
  return sub.toUpperCase() === "UK" ? "GB" : sub.toUpperCase();
}

/** Bidirectional-text marks Google puts around Arabic-locale titles (U+200E/F, U+202A–E, U+2066–9). */
export const BIDI_CHARS = /[‎‏‪-‮⁦-⁩؜]/g;

/**
 * Turns a free-text term into something safe to put inside double quotes:
 * no quotes, brackets, boolean operators or site: filters.
 */
export function cleanTerm(term: string): string {
  return term
    .replace(BIDI_CHARS, "")
    .replace(/site:\S+/gi, " ")
    .replace(/["“”()[\]{}]/g, " ")
    .replace(/\b(OR|AND|NOT)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function uniqueTerms(
  terms: string[],
  maxWords: number,
  limit: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const term = cleanTerm(raw);
    const key = term.toLowerCase();
    if (!term || seen.has(key) || wordCount(term) > maxWords) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= limit) break;
  }
  return out;
}

const quote = (term: string) => `"${term}"`;

function orGroup(terms: string[]): string {
  if (terms.length === 1) return quote(terms[0] as string);
  return `(${terms.map(quote).join(" OR ")})`;
}

/**
 * Location group: the job's city when it has one. The country is covered
 * by the site: subdomain; it's only quoted when the country has no
 * subdomain mapping.
 */
export function locationTerms(location: SearchLocation): string[] {
  if (location.city) return [location.city];
  if (COUNTRY_SUBDOMAINS[location.countryCode.toUpperCase()]) return [];
  return [countryName(location.countryCode)];
}

export function countryName(countryCode: string): string {
  const names: Record<string, string> = {
    EG: "Egypt",
    AE: "United Arab Emirates",
    SA: "Saudi Arabia",
  };
  return names[countryCode.toUpperCase()] ?? countryCode.toUpperCase();
}

export interface XrayQueryInput {
  titles: string[];
  skills: string[];
  location: SearchLocation;
}

/**
 * `site:eg.linkedin.com/in ("T1" OR "T2") "skill" "Cairo"` — quotes around
 * each term, at most 4 titles and 1 short skill (narrow queries return too
 * few people), never more than 32 words (titles go
 * first, then skills, when over budget). Returns null without a title.
 */
export function buildXrayQuery(input: XrayQueryInput): string | null {
  let titles = uniqueTerms(input.titles, MAX_TITLE_WORDS, MAX_TITLES);
  let skills = uniqueTerms(input.skills, MAX_SKILL_WORDS, MAX_SKILLS);
  const location = uniqueTerms(
    locationTerms(input.location),
    MAX_TITLE_WORDS,
    4,
  );
  if (titles.length === 0) return null;

  const assemble = () =>
    [
      siteFilter(input.location.countryCode),
      orGroup(titles),
      ...skills.map(quote),
      location.length ? orGroup(location) : "",
    ]
      .filter(Boolean)
      .join(" ");

  let query = assemble();
  while (wordCount(query) > MAX_QUERY_WORDS) {
    if (titles.length > 1) titles = titles.slice(0, -1);
    else if (skills.length > 0) skills = skills.slice(0, -1);
    else break;
    query = assemble();
  }
  return query;
}

export function normalizeQuery(query: string): string {
  return query
    .replace(BIDI_CHARS, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Exa takes natural language, not Google operators: turns an X-ray query
 * into "Sales Manager or Sales Director with Real Estate in Cairo".
 */
export function xrayToNaturalLanguage(query: string): string {
  const siteCountry = /site:([a-z]{2})\.linkedin\.com/i.exec(query)?.[1];
  const withoutSite = query.replace(/site:\S+/gi, " ");
  const groups: string[][] = [];
  const groupPattern = /\(([^)]*)\)|"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = groupPattern.exec(withoutSite)) !== null) {
    if (match[1] !== undefined) {
      groups.push(
        [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1] as string),
      );
    } else if (match[2] !== undefined) {
      groups.push([match[2]]);
    }
  }
  if (groups.length === 0) return cleanTerm(withoutSite);
  const [titles = [], ...rest] = groups;
  // With a country subdomain the location group is optional (city only).
  let place: string[] | undefined;
  let skills: string[];
  if (siteCountry) {
    const city = rest.length > 1 ? rest[rest.length - 1] : undefined;
    skills = (city ? rest.slice(0, -1) : rest).flat();
    place = city ?? [countryName(siteCountry)];
  } else {
    place = rest.length > 0 ? rest[rest.length - 1] : undefined;
    skills = rest.slice(0, -1).flat();
  }
  let text = titles.join(" or ");
  if (skills.length) text += ` with ${skills.join(" and ")}`;
  if (place?.length) text += ` in ${place.join(" or ")}`;
  return text;
}
