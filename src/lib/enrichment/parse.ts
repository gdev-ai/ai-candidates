import type { EnrichedExperience, LanguageProficiency } from "@/lib/enrichment/types";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

export function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

export function int(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

export function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Month as integer 1-12 from 7 / "7" / "Jul" / "July". */
export function parseMonth(value: unknown): number | null {
  const n = int(value);
  if (n !== null) return n >= 1 && n <= 12 ? n : null;
  if (typeof value !== "string") return null;
  return MONTHS[value.trim().slice(0, 4).toLowerCase()] ?? MONTHS[value.trim().slice(0, 3).toLowerCase()] ?? null;
}

export function parseYear(value: unknown): number | null {
  const n = int(value);
  if (n !== null) return n >= 1900 && n <= 2100 ? n : null;
  if (typeof value === "string") {
    const m = value.match(/\b(19|20)\d{2}\b/);
    return m ? Number(m[0]) : null;
  }
  return null;
}

/** "9 endorsements" / "1 endorsement" / 9 → 9. */
export function parseEndorsements(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value !== "string") return null;
  const m = value.replace(/,/g, "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function toIsoDate(year: number, month: number | null): string {
  return `${year}-${String(month ?? 1).padStart(2, "0")}-01`;
}

/**
 * "Issued May 2024 · Expired May 2026" / "Issued Jun 2025" /
 * "Issued May 2024 · Expires May 2027" → ISO dates (first of the month).
 */
export function parseCertificationDates(text: unknown): { issued_on: string | null; expires_on: string | null } {
  const value = str(text);
  if (!value) return { issued_on: null, expires_on: null };
  const pick = (pattern: RegExp): string | null => {
    const m = value.match(pattern);
    if (!m) return null;
    const year = parseYear(m[2]);
    return year ? toIsoDate(year, parseMonth(m[1])) : null;
  };
  return {
    issued_on: pick(/issued\s+(?:([a-z]+)\s+)?(\d{4})/i),
    expires_on: pick(/expire[sd]?\s+(?:([a-z]+)\s+)?(\d{4})/i),
  };
}

/** LinkedIn's proficiency labels → language proficiency enum. */
export function parseLanguageProficiency(value: unknown): LanguageProficiency | null {
  const text = str(value)?.toLowerCase();
  if (!text) return null;
  if (text.includes("native") || text.includes("bilingual")) return "native";
  if (text.includes("full professional")) return "full_professional";
  if (text.includes("professional working")) return "professional_working";
  if (text.includes("limited working")) return "limited_working";
  if (text.includes("elementary")) return "elementary";
  return null;
}

const LANGUAGE_CODES: Record<string, string> = {
  english: "en", arabic: "ar", french: "fr", german: "de", spanish: "es", italian: "it",
  chinese: "zh", mandarin: "zh", russian: "ru", turkish: "tr", japanese: "ja", dutch: "nl",
  portuguese: "pt", hindi: "hi", urdu: "ur", korean: "ko", persian: "fa", farsi: "fa",
  "العربية": "ar", "الانجليزية": "en", "الإنجليزية": "en", "الفرنسية": "fr", "الألمانية": "de",
  "الاسبانية": "es", "الإسبانية": "es", "الإيطالية": "it",
};

export function normalizeLanguageName(name: string): string | null {
  const key = name.trim().toLowerCase().replace(/\s*\(.*\)$/, "");
  return LANGUAGE_CODES[key] ?? null;
}

/** "Skills: A · B · C" (supreme_coder `insights`) → ["A", "B", "C"]. */
export function parseInsightSkills(insights: unknown): string[] {
  const text = str(insights);
  if (!text) return [];
  const m = text.match(/skills:\s*(.+)$/im);
  if (!m?.[1]) return [];
  return m[1]
    .split(/\s*[·,]\s*/)
    .map((s) => s.replace(/\s*and \+?\d+ skills?$/i, "").trim())
    .filter(Boolean);
}

/**
 * Total experience in years (1 decimal) from the UNION of role date ranges,
 * so overlapping roles aren't double counted. Unknown start month → Jan,
 * unknown end month → Dec; current roles run to `now`.
 */
export function experienceYearsFromRanges(
  experiences: Pick<EnrichedExperience, "start_year" | "start_month" | "end_year" | "end_month" | "is_current">[],
  now: Date = new Date(),
): number | null {
  const nowIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const ranges: [number, number][] = [];
  for (const e of experiences) {
    if (!e.start_year) continue;
    const start = e.start_year * 12 + ((e.start_month ?? 1) - 1);
    let end: number;
    if (e.is_current) end = nowIndex;
    else if (e.end_year) end = e.end_year * 12 + ((e.end_month ?? 12) - 1);
    else continue;
    end = Math.min(end, nowIndex);
    if (end < start) continue;
    ranges.push([start, end + 1]);
  }
  if (ranges.length === 0) return null;
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = ranges[0] as [number, number];
  for (const [s, e] of ranges.slice(1)) {
    if (s <= curEnd) curEnd = Math.max(curEnd, e);
    else {
      total += curEnd - curStart;
      [curStart, curEnd] = [s, e];
    }
  }
  total += curEnd - curStart;
  const years = Math.round((total / 12) * 10) / 10;
  return years > 60 ? null : years;
}

/** "Tanta, Al Gharbiyah, Egypt" → city / region. */
export function splitLocation(text: string | null): { city: string | null; region: string | null } {
  if (!text) return { city: null, region: null };
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { city: parts[0] ?? null, region: parts[1] ?? null };
  if (parts.length === 2) return { city: parts[0] ?? null, region: null };
  return { city: null, region: null };
}
