import { extractLinkedInSlug } from "@/lib/candidates/identity";
import { experienceYearsFromRanges } from "@/lib/enrichment/parse";
import type { EnrichedProfile } from "@/lib/enrichment/types";
import type { Insert, SourcingClient, Update } from "@/lib/supabase/types";
import type { Json } from "@/types/database.types";

/** Profiles enriched within this window are reused (global cache). */
export const ENRICHMENT_TTL_DAYS = 90;

/** Provider photo URLs are signed and expire after about 2 weeks; refetch before then. */
export const PHOTO_TTL_DAYS = 10;

export function isFresh(
  person: {
    enrichment_status: string;
    enriched_at: string | null;
    photo_url?: string | null;
    photo_fetched_at?: string | null;
  },
  now = Date.now(),
): boolean {
  if (person.enrichment_status !== "enriched" || !person.enriched_at)
    return false;
  if (now - Date.parse(person.enriched_at) >= ENRICHMENT_TTL_DAYS * 86_400_000)
    return false;
  // A stored photo link that has probably expired makes the profile stale.
  if (person.photo_url && person.photo_fetched_at) {
    return (
      now - Date.parse(person.photo_fetched_at) < PHOTO_TTL_DAYS * 86_400_000
    );
  }
  return true;
}

const CHILD_TABLES = [
  "person_experiences",
  "person_education",
  "person_certifications",
  "person_languages",
] as const;

async function check<T extends { error: unknown }>(
  promise: PromiseLike<T>,
): Promise<T> {
  const result = await promise;
  if (result.error) throw result.error;
  return result;
}

/**
 * Columns a unique constraint guards. A renamed vanity URL can leave two
 * people rows for one human; we never steal the id from the other row.
 */
async function freeUniqueIds(
  db: SourcingClient,
  personId: string,
  profile: EnrichedProfile,
): Promise<{ memberId: string | null; objectUrn: string | null }> {
  const claimed = async (
    column: "linkedin_member_id" | "linkedin_object_urn",
    value: string | null,
  ) => {
    if (!value) return null;
    const { data } = await db
      .from("people")
      .select("id")
      .eq(column, value)
      .neq("id", personId)
      .limit(1);
    return data && data.length > 0 ? null : value;
  };
  return {
    memberId: await claimed("linkedin_member_id", profile.memberId),
    objectUrn: await claimed("linkedin_object_urn", profile.objectUrn),
  };
}

export interface WriteProfileOptions {
  providerCallId: string | null;
  /** Raw provider payload for person_snapshots. */
  payload: unknown;
  /** Exa is partial: it fills empty fields and adds its rows, but doesn't mark the person enriched. */
  partial?: boolean;
}

/**
 * Writes one provider profile for a person: people columns (minus fields a
 * recruiter overrode), then replaces that source's child rows, then appends
 * the raw payload to person_snapshots. Every write is idempotent, so a
 * retried workflow step is safe.
 */
export async function writeEnrichedProfile(
  db: SourcingClient,
  personId: string,
  profile: EnrichedProfile,
  options: WriteProfileOptions,
): Promise<void> {
  const { data: existingRow } = await check(
    db
      .from("people")
      .select(
        "input_slugs, full_name, headline, current_title, current_company, location_text, country_code",
      )
      .eq("id", personId)
      .single(),
  );
  if (!existingRow) throw new Error(`Person ${personId} not found`);
  const existing = existingRow;
  const { data: overrides } = await check(
    db.from("person_overrides").select("field").eq("person_id", personId),
  );
  const overridden = new Set((overrides ?? []).map((o) => o.field));

  const inputSlug = extractLinkedInSlug(profile.inputUrl);
  const slugs = new Set(existing.input_slugs ?? []);
  if (inputSlug) slugs.add(inputSlug);
  if (profile.publicIdentifier)
    slugs.add(profile.publicIdentifier.toLowerCase());

  const experienceYears = experienceYearsFromRanges(profile.experiences);
  const now = new Date().toISOString();
  let update: Update<"people">;

  if (options.partial) {
    update = {
      input_slugs: [...slugs],
      full_name: existing.full_name ?? profile.fullName,
      current_title: existing.current_title ?? profile.currentTitle,
      current_company: existing.current_company ?? profile.currentCompany,
      location_text: existing.location_text ?? profile.locationText,
      country_code: existing.country_code ?? profile.countryCode,
      experience_years: experienceYears ?? undefined,
    };
  } else {
    const ids = await freeUniqueIds(db, personId, profile);
    update = {
      input_slugs: [...slugs],
      linkedin_member_id: ids.memberId ?? undefined,
      linkedin_object_urn: ids.objectUrn ?? undefined,
      linkedin_public_id: profile.publicIdentifier,
      profile_url: profile.profileUrl ?? undefined,
      first_name: profile.firstName,
      last_name: profile.lastName,
      full_name: profile.fullName,
      headline: profile.headline,
      about: profile.about,
      current_title: profile.currentTitle,
      current_company: profile.currentCompany,
      current_company_li_id: profile.currentCompanyLiId,
      location_text: profile.locationText,
      country_code: profile.countryCode,
      region: profile.region,
      city: profile.city,
      experience_years: experienceYears,
      open_to_work: profile.openToWork,
      hiring: profile.hiring,
      premium: profile.premium,
      verified: profile.verified,
      connections_count: profile.connectionsCount,
      followers_count: profile.followersCount,
      registered_at: profile.registeredAt,
      photo_url: profile.photoUrl,
      photo_fetched_at: profile.photoUrl ? now : null,
      section_totals: (profile.sectionTotals ?? null) as Json,
      enrichment_status: "enriched",
      enrichment_source: profile.source,
      enriched_at: now,
      enrichment_error: null,
    };
    // The provider's structured country is the best location evidence.
    if (profile.countryCode) {
      update.location_verified = profile.countryCode === "EG";
      update.location_method = "provider";
      update.location_evidence = profile.locationText ?? profile.countryCode;
    }
  }
  for (const field of overridden)
    delete (update as Record<string, unknown>)[field];
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) delete (update as Record<string, unknown>)[key];
  }
  await check(db.from("people").update(update).eq("id", personId));

  // Replace this source's rows; other sources' rows stay.
  for (const table of CHILD_TABLES) {
    await check(
      db
        .from(table)
        .delete()
        .eq("person_id", personId)
        .eq("source", profile.source),
    );
  }
  await check(
    db
      .from("person_skills")
      .delete()
      .eq("person_id", personId)
      .eq("source", profile.source),
  );

  const source = profile.source;
  if (profile.experiences.length) {
    const rows: Insert<"person_experiences">[] = profile.experiences.map(
      (e, i) => ({
        ...e,
        person_id: personId,
        sort_order: i,
        source,
      }),
    );
    await check(db.from("person_experiences").insert(rows));
  }
  if (profile.education.length) {
    const rows: Insert<"person_education">[] = profile.education.map(
      (e, i) => ({
        ...e,
        person_id: personId,
        sort_order: i,
        source,
      }),
    );
    await check(db.from("person_education").insert(rows));
  }
  if (profile.certifications.length) {
    const rows: Insert<"person_certifications">[] = profile.certifications.map(
      (c) => ({
        ...c,
        person_id: personId,
        source,
      }),
    );
    await check(db.from("person_certifications").insert(rows));
  }
  if (profile.languages.length) {
    const rows: Insert<"person_languages">[] = profile.languages.map((l) => ({
      ...l,
      person_id: personId,
      source,
    }));
    await check(db.from("person_languages").insert(rows));
  }
  if (profile.skills.length && source !== "exa") {
    const seen = new Set<string>();
    const rows: Insert<"person_skills">[] = [];
    for (const s of profile.skills) {
      const key = s.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push({
        person_id: personId,
        name: s.name.trim(),
        endorsements: s.endorsements,
        is_top: s.is_top,
        source,
      });
    }
    // PK is (person_id, name): provider data wins over another source's same-name row.
    await check(
      db.from("person_skills").upsert(rows, { onConflict: "person_id,name" }),
    );
  }

  await check(
    db.from("person_snapshots").insert({
      person_id: personId,
      provider_call_id: options.providerCallId,
      source,
      payload: (options.payload ?? {}) as Json,
    }),
  );
}

/** Marks people whose enrichment didn't happen, with the reason. */
export async function markEnrichment(
  db: SourcingClient,
  personIds: string[],
  status: "pending" | "not_found" | "failed",
  error: string | null,
): Promise<void> {
  if (personIds.length === 0) return;
  await check(
    db
      .from("people")
      .update({ enrichment_status: status, enrichment_error: error })
      .in("id", personIds),
  );
}
