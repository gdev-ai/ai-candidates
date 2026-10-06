/** Mirrors people.enrichment_source and the child tables' `source`. */
export type EnrichmentSource = "apify_supreme" | "harvestapi" | "exa";

export type LanguageProficiency =
  | "native"
  | "full_professional"
  | "professional_working"
  | "limited_working"
  | "elementary";

export interface EnrichedExperience {
  title: string | null;
  company: string | null;
  company_li_id: string | null;
  company_universal_name: string | null;
  experience_group_id: string | null;
  location: string | null;
  employment_type: string | null;
  workplace_type: string | null;
  start_year: number | null;
  start_month: number | null;
  end_year: number | null;
  end_month: number | null;
  is_current: boolean;
  description: string | null;
  skills: string[];
  duration_text: string | null;
}

export interface EnrichedEducation {
  school: string | null;
  school_li_id: string | null;
  degree: string | null;
  field_of_study: string | null;
  start_year: number | null;
  end_year: number | null;
  description: string | null;
}

export interface EnrichedSkill {
  name: string;
  endorsements: number | null;
  is_top: boolean;
}

export interface EnrichedCertification {
  title: string;
  issuer: string | null;
  issuer_li_url: string | null;
  credential_url: string | null;
  /** YYYY-MM-DD */
  issued_on: string | null;
  expires_on: string | null;
}

export interface EnrichedLanguage {
  name: string;
  name_normalized: string | null;
  proficiency: LanguageProficiency | null;
}

/** One provider's profile, normalized to the people + child-table columns. */
export interface EnrichedProfile {
  source: EnrichmentSource;
  /** The URL we asked for (maps results back; slugs can be renamed). */
  inputUrl: string | null;
  publicIdentifier: string | null;
  /** "ACoAA…" */
  memberId: string | null;
  /** Numeric member id. */
  objectUrn: string | null;
  profileUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  headline: string | null;
  about: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  currentCompanyLiId: string | null;
  locationText: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  openToWork: boolean | null;
  hiring: boolean | null;
  premium: boolean | null;
  verified: boolean | null;
  connectionsCount: number | null;
  followersCount: number | null;
  registeredAt: string | null;
  photoUrl: string | null;
  sectionTotals: Record<string, number> | null;
  experiences: EnrichedExperience[];
  education: EnrichedEducation[];
  skills: EnrichedSkill[];
  certifications: EnrichedCertification[];
  languages: EnrichedLanguage[];
}

export function emptyProfile(source: EnrichmentSource): EnrichedProfile {
  return {
    source,
    inputUrl: null,
    publicIdentifier: null,
    memberId: null,
    objectUrn: null,
    profileUrl: null,
    firstName: null,
    lastName: null,
    fullName: null,
    headline: null,
    about: null,
    currentTitle: null,
    currentCompany: null,
    currentCompanyLiId: null,
    locationText: null,
    countryCode: null,
    region: null,
    city: null,
    openToWork: null,
    hiring: null,
    premium: null,
    verified: null,
    connectionsCount: null,
    followersCount: null,
    registeredAt: null,
    photoUrl: null,
    sectionTotals: null,
    experiences: [],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
  };
}
