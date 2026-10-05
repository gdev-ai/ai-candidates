import { runStructured, type CallContext } from "@/lib/ai/structured";
import { countryName } from "@/lib/search/queryBuilder";
import {
  MATCH_WEIGHTS,
  matchOutputSchema,
  type MatchItem,
  type MatchingJob,
  type MatchingPerson,
  type MatchOutput,
} from "@/types/matching";

export const MATCH_PROMPT_VERSION = "match/2026-10-04";

const INSTRUCTIONS = `You are an expert recruiter scoring how well one candidate fits one job. Compare the candidate's actual data with each requirement.
Scoring (each 0-100):
- skills_score: required skills weigh more than preferred. Match semantically: synonyms ("JS" = "JavaScript"), umbrella terms (HTML/CSS/JS imply front-end), and skills evidenced by job titles or role descriptions all count.
- experience_score: candidate's total years and relevance of roles vs the job's range.
- seniority_score: level of recent titles and responsibilities vs the job's seniority.
- education_score: degrees and certifications vs the education requirements; 70 when the job lists none.
- location_score: 100 when based in the job's city/country, lower when elsewhere or unknown.
Items: one item per job requirement (use its ref, e.g. "R3", in requirement_ref) with status met / partial / missing, a short text, and evidence quoting the candidate data (empty when missing). Add items of kind experience, seniority and location, plus up to 3 "strength" items (status met) and up to 3 "concern" items (status missing or partial; requirement_ref null).
When the data gives no evidence either way, score conservatively and say so in a concern. Never invent facts.
summary: 2-3 sentences.`;

function monthYear(year: number | null, month: number | null): string {
  if (!year) return "?";
  return month ? `${String(month).padStart(2, "0")}/${year}` : String(year);
}

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Requirement refs ("R1"…) in prompt order; mapped back to ids afterwards. */
export function requirementRefs(job: MatchingJob): Map<string, string> {
  return new Map(job.requirements.map((r, i) => [`R${i + 1}`, r.id]));
}

export function buildMatchInput(job: MatchingJob, person: MatchingPerson): string {
  const range =
    job.min_experience === null && job.max_experience === null
      ? "not specified"
      : `${job.min_experience ?? 0}${job.max_experience !== null ? `-${job.max_experience}` : "+"} years`;
  const where = job.city ? `${job.city}, ${countryName(job.country_code)}` : countryName(job.country_code);

  const jobLines = [
    `JOB`,
    `Title: ${job.title}`,
    `Seniority: ${job.seniority ?? "not specified"}`,
    `Location: ${where}${job.work_arrangement ? ` (${job.work_arrangement})` : ""}`,
    `Employment type: ${job.employment_type ?? "not specified"}`,
    `Experience: ${range}`,
    `Requirements:`,
    ...job.requirements.map((r, i) => `R${i + 1} [${r.kind}${r.weight !== 1 ? `, weight ${r.weight}` : ""}] ${r.text}`),
  ];

  const p = person;
  const personLines = [
    ``,
    `CANDIDATE${p.enriched ? "" : " (search snippet only, profile not enriched)"}`,
    `Name: ${p.full_name ?? "unknown"}`,
    `Headline: ${p.headline ?? "unknown"}`,
    `Current: ${[p.current_title, p.current_company].filter(Boolean).join(" at ") || "unknown"}`,
    `Location: ${p.location_text ?? "unknown"}${p.location_verified === true ? " (verified in country)" : p.location_verified === false ? " (verified outside country)" : ""}`,
    `Total experience: ${p.experience_years ?? "unknown"} years`,
  ];
  if (p.about || p.search_snippet) personLines.push(`About: ${truncate(p.about ?? p.search_snippet, 600)}`);
  if (p.experiences.length) {
    personLines.push(`Experience:`);
    for (const e of p.experiences.slice(0, 12)) {
      const end = e.is_current ? "present" : monthYear(e.end_year, e.end_month);
      const desc = truncate(e.description, 250);
      personLines.push(
        `- ${e.title ?? "?"} at ${e.company ?? "?"} (${monthYear(e.start_year, e.start_month)} – ${end})${e.location ? `, ${e.location}` : ""}${desc ? `: ${desc}` : ""}`,
      );
    }
  }
  if (p.education.length) {
    personLines.push(`Education:`);
    for (const e of p.education.slice(0, 5)) {
      personLines.push(
        `- ${[e.degree, e.field_of_study].filter(Boolean).join(", ") || "?"} — ${e.school ?? "?"}${e.end_year ? ` (${e.end_year})` : ""}`,
      );
    }
  }
  if (p.skills.length) {
    personLines.push(
      `Skills: ${p.skills
        .slice(0, 40)
        .map((s) => (s.endorsements ? `${s.name} (${s.endorsements})` : s.name))
        .join(", ")}`,
    );
  }
  if (p.certifications.length) {
    personLines.push(`Certifications: ${p.certifications.slice(0, 10).map((c) => [c.title, c.issuer].filter(Boolean).join(" — ")).join("; ")}`);
  }
  if (p.languages.length) {
    personLines.push(`Languages: ${p.languages.map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name)).join(", ")}`);
  }
  return [...jobLines, ...personLines].join("\n");
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Overall score from the sub-scores and MATCH_WEIGHTS (reproducible, not model-chosen). */
export function computeMatchScore(output: Pick<MatchOutput, "skills_score" | "experience_score" | "seniority_score" | "education_score" | "location_score">): number {
  return round2(
    output.skills_score * MATCH_WEIGHTS.skills +
      output.experience_score * MATCH_WEIGHTS.experience +
      output.seniority_score * MATCH_WEIGHTS.seniority +
      output.education_score * MATCH_WEIGHTS.education +
      output.location_score * MATCH_WEIGHTS.location,
  );
}

export function toMatchItems(output: MatchOutput, refs: Map<string, string>): MatchItem[] {
  return output.items.map((item) => {
    const requirementId = item.requirement_ref ? refs.get(item.requirement_ref.trim().toUpperCase()) : undefined;
    return {
      kind: item.kind,
      ...(requirementId ? { requirement_id: requirementId } : {}),
      status: item.status,
      text: item.text,
      evidence: item.evidence,
    };
  });
}

export interface ScoredMatch {
  match_score: number;
  skills_score: number;
  experience_score: number;
  location_score: number;
  education_score: number;
  seniority_score: number;
  summary: string;
  items: MatchItem[];
  callId: string | null;
  model: string;
  promptVersion: string;
}

export async function scoreCandidate(
  job: MatchingJob,
  person: MatchingPerson,
  options: { context?: CallContext; bulk?: boolean } = {},
): Promise<ScoredMatch> {
  const result = await runStructured({
    purpose: "match",
    schema: matchOutputSchema,
    schemaName: "candidate_match",
    instructions: INSTRUCTIONS,
    input: buildMatchInput(job, person),
    effort: "low",
    maxOutputTokens: 3000,
    promptVersion: MATCH_PROMPT_VERSION,
    serviceTier: options.bulk ? "flex" : "default",
    context: options.context,
  });
  const out = result.data;
  return {
    match_score: computeMatchScore(out),
    skills_score: round2(out.skills_score),
    experience_score: round2(out.experience_score),
    location_score: round2(out.location_score),
    education_score: round2(out.education_score),
    seniority_score: round2(out.seniority_score),
    summary: out.summary,
    items: toMatchItems(out, requirementRefs(job)),
    callId: result.callId,
    model: result.model,
    promptVersion: result.promptVersion,
  };
}
