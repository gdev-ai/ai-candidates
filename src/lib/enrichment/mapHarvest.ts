import { canonicalLinkedInUrl, isOwnCompany } from "@/lib/candidates/identity";
import {
  bool,
  int,
  normalizeLanguageName,
  parseCertificationDates,
  parseEndorsements,
  parseLanguageProficiency,
  parseMonth,
  parseYear,
  str,
} from "@/lib/enrichment/parse";
import { emptyProfile, type EnrichedProfile } from "@/lib/enrichment/types";

interface HarvestDate {
  month?: string | number;
  year?: number;
  text?: string;
}

/**
 * HarvestAPI profile `element` (same schema as the retired harvestapi actor,
 * verified on 243 actor items + 1 live direct-API call).
 */
export interface HarvestElement {
  id?: string;
  publicIdentifier?: string;
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  about?: string;
  openToWork?: boolean;
  hiring?: boolean;
  premium?: boolean;
  verified?: boolean;
  objectUrn?: string;
  registeredAt?: string;
  connectionsCount?: number;
  followerCount?: number;
  photo?: string;
  topSkills?: (string | { name?: string })[];
  location?: {
    linkedinText?: string;
    countryCode?: string;
    parsed?: { countryCode?: string; state?: string | null; city?: string | null };
  };
  currentPosition?: { position?: string; companyName?: string; companyId?: string }[];
  experience?: {
    position?: string;
    location?: string;
    employmentType?: string | null;
    workplaceType?: string | null;
    companyName?: string;
    companyUniversalName?: string;
    companyId?: string;
    duration?: string;
    description?: string | null;
    skills?: string[] | null;
    experienceGroupId?: string;
    startDate?: HarvestDate | null;
    endDate?: HarvestDate | null;
  }[];
  education?: {
    schoolName?: string;
    schoolId?: string | null;
    degree?: string;
    fieldOfStudy?: string | null;
    description?: string | null;
    startDate?: HarvestDate | null;
    endDate?: HarvestDate | null;
  }[];
  skills?: { name?: string; endorsements?: string }[];
  certifications?: {
    title?: string;
    issuedBy?: string | null;
    issuedByLink?: string | null;
    issuedAt?: string | null;
    link?: string | null;
  }[];
  languages?: { name?: string; proficiency?: string }[];
  sectionTotals?: Record<string, number>;
}

function isPresent(date: HarvestDate | null | undefined): boolean {
  return /present/i.test(date?.text ?? "");
}

export function mapHarvestElement(element: HarvestElement, inputUrl: string | null): EnrichedProfile {
  const profile = emptyProfile("harvestapi");
  const slug = str(element.publicIdentifier)?.toLowerCase() ?? null;
  const firstName = str(element.firstName);
  const lastName = str(element.lastName);
  const current = element.currentPosition?.[0];
  const topSkills = new Set(
    (element.topSkills ?? [])
      .map((s) => (typeof s === "string" ? s : s.name))
      .filter((s): s is string => Boolean(s))
      .map((s) => s.toLowerCase()),
  );
  const parsedLocation = element.location?.parsed;
  const currentCompany = str(current?.companyName);

  return {
    ...profile,
    inputUrl,
    publicIdentifier: slug,
    memberId: str(element.id),
    objectUrn: str(element.objectUrn),
    profileUrl: slug ? canonicalLinkedInUrl(slug) : str(element.linkedinUrl),
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" ") || null,
    headline: str(element.headline),
    about: str(element.about),
    currentTitle: str(current?.position),
    currentCompany: isOwnCompany(currentCompany) ? null : currentCompany,
    currentCompanyLiId: str(current?.companyId),
    locationText: str(element.location?.linkedinText),
    countryCode:
      (str(element.location?.countryCode) ?? str(parsedLocation?.countryCode))?.toUpperCase() ?? null,
    region: str(parsedLocation?.state),
    city: str(parsedLocation?.city),
    openToWork: bool(element.openToWork),
    hiring: bool(element.hiring),
    premium: bool(element.premium),
    verified: bool(element.verified),
    connectionsCount: int(element.connectionsCount),
    followersCount: int(element.followerCount),
    registeredAt: str(element.registeredAt),
    photoUrl: str(element.photo),
    sectionTotals: element.sectionTotals ?? null,
    experiences: (element.experience ?? []).map((e) => ({
      title: str(e.position),
      company: str(e.companyName),
      company_li_id: str(e.companyId),
      company_universal_name: str(e.companyUniversalName),
      experience_group_id: str(e.experienceGroupId),
      location: str(e.location),
      employment_type: str(e.employmentType),
      workplace_type: str(e.workplaceType),
      start_year: parseYear(e.startDate?.year),
      start_month: parseMonth(e.startDate?.month),
      end_year: isPresent(e.endDate) ? null : parseYear(e.endDate?.year),
      end_month: isPresent(e.endDate) ? null : parseMonth(e.endDate?.month),
      is_current: isPresent(e.endDate),
      description: str(e.description),
      skills: (e.skills ?? []).filter((s): s is string => typeof s === "string"),
      duration_text: str(e.duration),
    })),
    education: (element.education ?? []).map((e) => ({
      school: str(e.schoolName),
      school_li_id: str(e.schoolId),
      degree: str(e.degree),
      field_of_study: str(e.fieldOfStudy),
      start_year: parseYear(e.startDate?.year),
      end_year: parseYear(e.endDate?.year),
      description: str(e.description),
    })),
    skills: (element.skills ?? [])
      .filter((s) => str(s.name))
      .map((s) => ({
        name: str(s.name) as string,
        endorsements: parseEndorsements(s.endorsements),
        is_top: topSkills.has((s.name as string).toLowerCase()),
      })),
    certifications: (element.certifications ?? [])
      .filter((c) => str(c.title))
      .map((c) => ({
        title: str(c.title) as string,
        issuer: str(c.issuedBy),
        issuer_li_url: str(c.issuedByLink),
        credential_url: str(c.link),
        ...parseCertificationDates(c.issuedAt),
      })),
    languages: (element.languages ?? [])
      .filter((l) => str(l.name))
      .map((l) => ({
        name: str(l.name) as string,
        name_normalized: normalizeLanguageName(l.name as string),
        proficiency: parseLanguageProficiency(l.proficiency),
      })),
  };
}
