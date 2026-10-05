import { canonicalLinkedInUrl, isOwnCompany } from "@/lib/candidates/identity";
import {
  bool,
  int,
  normalizeLanguageName,
  parseCertificationDates,
  parseEndorsements,
  parseInsightSkills,
  parseLanguageProficiency,
  parseMonth,
  parseYear,
  splitLocation,
  str,
} from "@/lib/enrichment/parse";
import {
  emptyProfile,
  type EnrichedCertification,
  type EnrichedExperience,
  type EnrichedProfile,
} from "@/lib/enrichment/types";

/** Dataset item of Apify `supreme_coder~linkedin-profile-scraper` (verified live on 37 items). */
export interface SupremeItem {
  inputUrl?: string;
  error?: string;
  id?: string;
  profileId?: string;
  publicIdentifier?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  summary?: string;
  created?: number;
  premium?: boolean;
  isVerified?: boolean;
  countryCode?: string;
  geoLocationName?: string;
  companyName?: string;
  currentCompany?: { entityUrn?: string; name?: string } | null;
  followerCount?: number;
  connectionsCount?: number;
  pictureUrl?: Record<string, string> | null;
  positions?: SupremePosition[];
  educations?: {
    schoolName?: string;
    schoolUrl?: string;
    degreeName?: string;
    fieldOfStudy?: string;
    timePeriod?: SupremeTimePeriod;
  }[];
  skills?: { name?: string; endorsements?: number | string }[];
  certifications?: {
    name?: string;
    authority?: string;
    issuer?: string;
    url?: string;
    timePeriod?: SupremeTimePeriod;
    issueDate?: string | null;
  }[];
  languages?: { name?: string; proficiency?: string }[];
}

interface SupremeTimePeriod {
  startDate?: { month?: number; year?: number } | null;
  endDate?: { month?: number; year?: number } | null;
}

interface SupremePosition {
  title?: string;
  locationName?: string;
  timePeriod?: SupremeTimePeriod;
  totalDuration?: string;
  description?: string;
  insights?: string;
  employmentType?: string | null;
  company?: { url?: string; name?: string } | null;
  /** Several roles at one employer are nested under a group. */
  positions?: SupremePosition[];
}

function companyIdFromUrl(url: string | null | undefined): string | null {
  return url?.match(/linkedin\.com\/company\/([^/?#]+)/i)?.[1] ?? null;
}

function mapPosition(
  position: SupremePosition,
  group: SupremePosition | null,
  groupId: string | null,
): EnrichedExperience {
  const company = group?.company ?? position.company ?? null;
  const companyRef = companyIdFromUrl(company?.url);
  const period = position.timePeriod ?? {};
  const isNumeric = companyRef !== null && /^\d+$/.test(companyRef);
  return {
    title: str(position.title),
    company: str(company?.name),
    company_li_id: isNumeric ? companyRef : null,
    company_universal_name: companyRef && !isNumeric ? companyRef : null,
    experience_group_id: groupId,
    location: str(position.locationName) ?? str(group?.locationName),
    employment_type: str(position.employmentType) ?? str(group?.employmentType),
    workplace_type: null,
    start_year: parseYear(period.startDate?.year),
    start_month: parseMonth(period.startDate?.month),
    end_year: parseYear(period.endDate?.year),
    end_month: parseMonth(period.endDate?.month),
    // A current role has `endDate: null`.
    is_current: Boolean(period.startDate) && !period.endDate,
    description: str(position.description),
    skills: parseInsightSkills(position.insights),
    duration_text: str(position.totalDuration),
  };
}

export function flattenSupremePositions(positions: SupremePosition[] = []): EnrichedExperience[] {
  const out: EnrichedExperience[] = [];
  positions.forEach((position, index) => {
    if (position.positions?.length) {
      const groupId = `${companyIdFromUrl(position.company?.url) ?? str(position.company?.name) ?? "group"}#${index}`;
      for (const inner of position.positions) out.push(mapPosition(inner, position, groupId));
    } else {
      out.push(mapPosition(position, null, null));
    }
  });
  return out;
}

export function isSupremeError(item: SupremeItem): boolean {
  return typeof item.error === "string" && !item.publicIdentifier;
}

export function mapSupremeItem(item: SupremeItem): EnrichedProfile {
  const profile = emptyProfile("apify_supreme");
  const slug = str(item.publicIdentifier);
  const experiences = flattenSupremePositions(item.positions);
  const current = experiences.find((e) => e.is_current) ?? null;
  const locationText = str(item.geoLocationName);
  const { city, region } = splitLocation(locationText);
  const firstName = str(item.firstName);
  const lastName = str(item.lastName);
  const pictures = item.pictureUrl ?? {};
  const currentCompany = str(item.companyName) ?? str(item.currentCompany?.name) ?? current?.company ?? null;

  const certifications: EnrichedCertification[] = (item.certifications ?? [])
    .filter((c) => str(c.name))
    .map((c) => {
      const start = c.timePeriod?.startDate;
      const end = c.timePeriod?.endDate;
      const fromText = parseCertificationDates(c.issueDate);
      const startYear = parseYear(start?.year);
      const endYear = parseYear(end?.year);
      return {
        title: str(c.name) as string,
        issuer: str(c.issuer) ?? str(c.authority),
        issuer_li_url: null,
        credential_url: str(c.url),
        issued_on: startYear
          ? `${startYear}-${String(parseMonth(start?.month) ?? 1).padStart(2, "0")}-01`
          : fromText.issued_on,
        expires_on: endYear
          ? `${endYear}-${String(parseMonth(end?.month) ?? 1).padStart(2, "0")}-01`
          : fromText.expires_on,
      };
    });

  return {
    ...profile,
    inputUrl: str(item.inputUrl),
    publicIdentifier: slug,
    memberId: str(item.profileId),
    objectUrn: str(item.id),
    profileUrl: slug ? canonicalLinkedInUrl(slug) : str(item.inputUrl),
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" ") || null,
    headline: str(item.headline),
    about: str(item.summary),
    currentTitle: current?.title ?? null,
    currentCompany: isOwnCompany(currentCompany) ? null : currentCompany,
    currentCompanyLiId:
      str(item.currentCompany?.entityUrn)?.match(/(\d+)$/)?.[1] ?? current?.company_li_id ?? null,
    locationText,
    countryCode: str(item.countryCode)?.toUpperCase() ?? null,
    region,
    city,
    premium: bool(item.premium),
    verified: bool(item.isVerified),
    connectionsCount: int(item.connectionsCount),
    followersCount: int(item.followerCount),
    registeredAt: typeof item.created === "number" ? new Date(item.created).toISOString() : null,
    photoUrl: pictures["800x800"] ?? pictures["400x400"] ?? pictures["200x200"] ?? null,
    experiences,
    education: (item.educations ?? []).map((e) => ({
      school: str(e.schoolName),
      school_li_id: companyIdFromUrl(e.schoolUrl),
      degree: str(e.degreeName),
      field_of_study: str(e.fieldOfStudy),
      start_year: parseYear(e.timePeriod?.startDate?.year),
      end_year: parseYear(e.timePeriod?.endDate?.year),
      description: null,
    })),
    skills: (item.skills ?? [])
      .filter((s) => str(s.name))
      .map((s) => ({ name: str(s.name) as string, endorsements: parseEndorsements(s.endorsements), is_top: false })),
    certifications,
    languages: (item.languages ?? [])
      .filter((l) => str(l.name))
      .map((l) => ({
        name: str(l.name) as string,
        name_normalized: normalizeLanguageName(l.name as string),
        proficiency: parseLanguageProficiency(l.proficiency),
      })),
  };
}
