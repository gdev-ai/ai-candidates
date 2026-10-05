/**
 * Deterministic location knowledge for Egypt sourcing: recognising Egyptian
 * places (English and Arabic, as LinkedIn shows both), recognising clearly
 * foreign places, and SerpApi's canonical location names.
 */

export const EGYPT_GOVERNORATES = [
  "Cairo",
  "Giza",
  "Alexandria",
  "Qalyubia",
  "Port Said",
  "Suez",
  "Dakahlia",
  "Sharqia",
  "Gharbia",
  "Monufia",
  "Beheira",
  "Kafr El Sheikh",
  "Damietta",
  "Ismailia",
  "Faiyum",
  "Beni Suef",
  "Minya",
  "Asyut",
  "Sohag",
  "Qena",
  "Luxor",
  "Aswan",
  "Red Sea",
  "New Valley",
  "Matrouh",
  "North Sinai",
  "South Sinai",
] as const;

const EGYPT_TERMS = [
  "egypt",
  ...EGYPT_GOVERNORATES.map((g) => g.toLowerCase()),
  "new cairo",
  "6th of october",
  "sheikh zayed",
  "new capital",
  "10th of ramadan",
  "nasr city",
  "heliopolis",
  "maadi",
  "mansoura",
  "tanta",
  "zagazig",
  "hurghada",
  "sharm el sheikh",
  "el gouna",
  "ain sokhna",
  "damanhur",
  "mahalla",
  "al gharbiyah",
  "ad daqahliyah",
  "ash sharqiyah",
  "al qalyubiyah",
];
const EGYPT_TERMS_AR = ["مصر", "القاهرة", "الجيزة", "الإسكندرية", "الاسكندرية", "المنصورة", "طنطا", "الزقازيق", "أسيوط", "بورسعيد", "السويس", "الإسماعيلية"];

// Countries and big regional cities whose presence means "not Egypt". A
// place name that also exists in Egypt (Alexandria, Cairo) is disambiguated
// by the country these carry ("Alexandria, Virginia, United States").
const FOREIGN_TERMS = [
  "united arab emirates",
  "uae",
  "dubai",
  "abu dhabi",
  "sharjah",
  "saudi arabia",
  "ksa",
  "riyadh",
  "jeddah",
  "dammam",
  "qatar",
  "doha",
  "kuwait",
  "bahrain",
  "oman",
  "muscat",
  "jordan",
  "lebanon",
  "beirut",
  "iraq",
  "morocco",
  "tunisia",
  "algeria",
  "libya",
  "sudan",
  "turkey",
  "united states",
  "usa",
  "canada",
  "united kingdom",
  "england",
  "london",
  "ireland",
  "germany",
  "france",
  "netherlands",
  "spain",
  "italy",
  "poland",
  "india",
  "pakistan",
  "australia",
  "virginia",
  "georgia",
  "illinois",
  "ontario",
];
const FOREIGN_TERMS_AR = ["الإمارات", "الامارات", "السعودية", "قطر", "الكويت", "البحرين", "الأردن", "لبنان", "المملكة المتحدة", "الولايات المتحدة"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(lower: string, terms: string[]): string | null {
  for (const term of terms) {
    if (new RegExp(`(^|[^a-z])${escapeRegExp(term)}([^a-z]|$)`).test(lower)) return term;
  }
  return null;
}

function containsArabic(text: string, terms: string[]): string | null {
  return terms.find((term) => text.includes(term)) ?? null;
}

export function mentionsEgypt(text: string | null | undefined): string | null {
  if (!text) return null;
  return containsTerm(text.toLowerCase(), EGYPT_TERMS) ?? containsArabic(text, EGYPT_TERMS_AR);
}

export function mentionsForeignPlace(text: string | null | undefined): string | null {
  if (!text) return null;
  return containsTerm(text.toLowerCase(), FOREIGN_TERMS) ?? containsArabic(text, FOREIGN_TERMS_AR);
}

/** Whether a short text (a subtitle segment) reads like a place. */
export function looksLikeLocation(text: string): boolean {
  return Boolean(mentionsEgypt(text) || mentionsForeignPlace(text) || /\b(area|governorate|region)\b/i.test(text));
}

export interface LocationVerdict {
  /** true = in the target country, false = clearly elsewhere, null = can't tell. */
  inCountry: boolean | null;
  evidence: string | null;
}

/**
 * Classifies a location string (a profile's location line, not a whole
 * snippet — snippets mention past jobs' cities). Only Egypt is supported
 * deterministically; other countries always come back undecided.
 */
export function classifyLocationText(
  text: string | null | undefined,
  countryCode: string,
): LocationVerdict {
  const value = text?.trim();
  if (!value || countryCode.toUpperCase() !== "EG") return { inCountry: null, evidence: null };
  const foreign = mentionsForeignPlace(value);
  const egypt = mentionsEgypt(value);
  const explicitEgypt = /egypt|مصر/i.test(value);
  if (foreign && !explicitEgypt) return { inCountry: false, evidence: value };
  if (foreign && explicitEgypt) return { inCountry: null, evidence: value };
  if (egypt) return { inCountry: true, evidence: value };
  return { inCountry: null, evidence: null };
}

/** SerpApi `location` values, verified against its locations API. */
const SERPAPI_CANONICAL: Record<string, string> = {
  cairo: "Cairo,Cairo Governorate,Egypt",
  giza: "Giza,Giza Governorate,Egypt",
  alexandria: "Alexandria,Alexandria Governorate,Egypt",
  suez: "Suez,Suez Governorate,Egypt",
  mansoura: "Mansoura,Dakahlia Governorate,Egypt",
};

export function serpApiLocation(city: string | null, countryCode: string): string | null {
  if (countryCode.toUpperCase() !== "EG") return null;
  if (city) return SERPAPI_CANONICAL[city.trim().toLowerCase()] ?? "Egypt";
  return "Egypt";
}
