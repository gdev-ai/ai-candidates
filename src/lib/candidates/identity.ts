/**
 * Who a search result or enrichment item is: the people.identity_key
 * (`linkedin:<slug>` | `url:<normalized>` | `name-company:<n>|<c>`).
 * People are upserted on it with exact equality — never `ilike`, which let
 * `/in/john` match `/in/johnsmith`.
 */

const COMPANY_SUFFIX =
  /\b(inc|incorporated|llc|ltd|limited|co|corp|corporation|gmbh|plc|group|holdings|company|s\.?a\.?e)\b\.?/gi;

/** `/in/<slug>` from any LinkedIn URL (any subdomain, locale suffix, query). */
export function extractLinkedInSlug(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const match = url.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!match?.[1]) return null;
  let slug = match[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // Malformed escape: keep the raw slug.
  }
  slug = slug.trim().toLowerCase();
  return slug || null;
}

export function canonicalLinkedInUrl(slug: string): string {
  return `https://www.linkedin.com/in/${encodeURIComponent(slug)}`;
}

export function normalizeUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeForMatching(value: string): string {
  return stripDiacritics(value)
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

export function normalizeCompanyForMatching(value: string): string {
  const normalized = normalizeForMatching(value);
  return (
    normalized.replace(COMPANY_SUFFIX, "").replace(/\s+/g, " ").trim() ||
    normalized
  );
}

export function identityKey(input: {
  profileUrl?: string | null;
  name?: string | null;
  company?: string | null;
}): string | null {
  if (input.profileUrl) {
    const slug = extractLinkedInSlug(input.profileUrl);
    if (slug) return `linkedin:${slug}`;
    const normalized = normalizeUrl(input.profileUrl);
    if (normalized) return `url:${normalized}`;
  }
  if (input.name?.trim() && input.company?.trim()) {
    return `name-company:${normalizeForMatching(input.name)}|${normalizeCompanyForMatching(input.company)}`;
  }
  return null;
}

/** Results that are not an individual's profile (company pages, job boards...). */
const NON_INDIVIDUAL_URL_PATTERNS: RegExp[] = [
  /linkedin\.com\/(company|school|jobs|pulse|showcase|groups|posts|feed|events)\b/i,
  /\/(jobs?|careers?|vacanc(?:y|ies))(\/|$|\?)/i,
  /\b(indeed|glassdoor|bayt|wuzzuf|naukri|monster|ziprecruiter|careerjet)\.[a-z.]+\//i,
];

export function isIndividualProfileUrl(url: string): boolean {
  return !NON_INDIVIDUAL_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Our group's companies (public.companies): people working at any of them
 * are never sourced. Compared without spaces or punctuation, so "New Giza",
 * "NEWGIZA" and "G Developments - ISC" all match.
 */
const OWN_COMPANY_KEYS = new Set([
  "gdevelopments",
  "thegdevelopments",
  "gdevelopmentsisc",
  "newgiza",
  "ginvestments",
  "gcommunities",
  "glifestyle",
]);

export function isOwnCompany(company: string | null | undefined): boolean {
  return company
    ? OWN_COMPANY_KEYS.has(
        normalizeCompanyForMatching(company).replace(/[^\p{L}\p{N}]+/gu, ""),
      )
    : false;
}
