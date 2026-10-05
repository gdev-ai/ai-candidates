import { parseMonth, parseYear, splitLocation, str } from "@/lib/enrichment/parse";
import { emptyProfile, type EnrichedProfile } from "@/lib/enrichment/types";
import { currentExaRole, type ExaPersonProperties } from "@/lib/search/ExaProvider";

/** "2023-10-01" / "2001" → year + month. */
function exaDate(value: string | null | undefined): { year: number | null; month: number | null } {
  if (!value) return { year: null, month: null };
  const [y, m] = value.split("-");
  return { year: parseYear(y), month: m ? parseMonth(Number(m)) : null };
}

/**
 * Exa people-search entity → partial profile (work + education history with
 * dates, location). Written with source 'exa'; full enrichment later
 * replaces only its own source's rows.
 */
export function mapExaPerson(person: ExaPersonProperties, profileUrl: string): EnrichedProfile {
  const profile = emptyProfile("exa");
  const current = currentExaRole(person);
  const locationText = str(person.location);
  const { city, region } = splitLocation(locationText);
  return {
    ...profile,
    inputUrl: profileUrl,
    profileUrl,
    firstName: str(person.firstName),
    lastName: str(person.lastName),
    fullName: str(person.name),
    currentTitle: current && !current.dates?.to ? str(current.title) : null,
    currentCompany: current && !current.dates?.to ? str(current.company?.name) : null,
    locationText,
    city,
    region,
    countryCode: /egypt/i.test(locationText ?? "") ? "EG" : null,
    experiences: (person.workHistory ?? []).map((role) => {
      const from = exaDate(role.dates?.from);
      const to = exaDate(role.dates?.to);
      return {
        title: str(role.title),
        company: str(role.company?.name),
        company_li_id: null,
        company_universal_name: null,
        experience_group_id: null,
        location: str(role.location),
        employment_type: null,
        workplace_type: null,
        start_year: from.year,
        start_month: from.month,
        end_year: to.year,
        end_month: to.month,
        is_current: Boolean(role.dates?.from) && !role.dates?.to,
        description: null,
        skills: [],
        duration_text: null,
      };
    }),
    education: (person.educationHistory ?? []).map((e) => ({
      school: str(e.institution?.name),
      school_li_id: null,
      degree: str(e.degree),
      field_of_study: null,
      start_year: exaDate(e.dates?.from).year,
      end_year: exaDate(e.dates?.to).year,
      description: null,
    })),
  };
}
