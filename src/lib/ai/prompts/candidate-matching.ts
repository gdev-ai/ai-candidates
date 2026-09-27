import type { AIProvider } from "@/lib/ai/AIProvider";
import { parseJsonResponse } from "@/lib/ai/parseJsonResponse";
import {
  matchResultSchema,
  type MatchResult,
  type MatchingJobInput,
  type MatchingCandidateInput,
} from "@/types/matching";

const SYSTEM_INSTRUCTION = `You are an expert technical recruiter scoring how well a candidate matches a job's requirements.
Every sub-score must be explicitly justified by comparing the candidate's actual data against the job's stated requirements — never assign a score based on a general impression.

When comparing skills, reason semantically — never require a literal string match:
- Recognize synonyms and equivalent naming for the same technology (e.g. "JS" = "JavaScript", "Node" = "Node.js", "Postgres" = "PostgreSQL").
- Recognize umbrella/role terms that imply a set of underlying skills (e.g. a candidate skill list of "HTML, CSS, JavaScript" satisfies a job requirement of "Front-End Development" or is core evidence toward "Full Stack Development"; a headline or summary of "Web Developer" implies working knowledge of HTML/CSS/JS even if those exact words aren't listed as skills). Use your own domain knowledge of what a role or umbrella term typically requires.
- When a job requirement is itself an umbrella term covering multiple underlying skills (e.g. "Full Stack Development" implies both front-end basics and a back-end/server skill), treat it as partially satisfied when only part of the umbrella is covered: name the covered part in "matched_requirements" and the uncovered part in "missing_requirements" — don't collapse a partial match into one vague low score.
- Still never invent a specific skill, technology, or qualification the candidate's data gives no basis for — semantic matching means recognizing what evidence in the data reasonably implies, not assuming unstated specifics.

The candidate record often lacks structured education or seniority fields; when the available text (headline, summary, skills) gives genuinely no evidence either way for a dimension, score it conservatively and say so in "concerns" — this conservatism is about absence of evidence, not about requiring exact wording when the evidence clearly implies the skill.
Respond with raw JSON only. Do not wrap the JSON in markdown code fences.`;

function formatExperienceRange(range: MatchingJobInput["years_of_experience"]): string {
  if (range.minimum === null && range.maximum === null) return "(not specified)";
  if (range.maximum === null) return `${range.minimum}+ years`;
  if (range.minimum === null) return `up to ${range.maximum} years`;
  return `${range.minimum}-${range.maximum} years`;
}

export function buildCandidateMatchingPrompt(
  job: MatchingJobInput,
  candidate: MatchingCandidateInput,
): string {
  return `Compare this candidate against this job's requirements and produce a structured match assessment as JSON matching exactly this shape:

{
  "match_score": number (0-100, overall weighted score),
  "skills_score": number (0-100, based on how well candidate.skills/headline/summary satisfy required_skills and preferred_skills — match semantically: synonyms, equivalent naming, and umbrella/role terms count as evidence, not just identical wording),
  "experience_score": number (0-100, based on candidate.experience_years vs the job's years_of_experience range),
  "location_score": number (0-100, based on candidate.location vs the job's location; 100 if they match or the job has no location requirement),
  "education_score": number (0-100, based on whether the candidate's available text suggests the job's education requirements are met; score conservatively if there isn't enough information),
  "seniority_score": number (0-100, based on whether the candidate's headline/summary/experience suggests the job's seniority level),
  "matched_requirements": string[] (specific requirements from the job that this candidate's data clearly satisfies),
  "missing_requirements": string[] (specific requirements from the job that this candidate's data does not show),
  "strengths": string[] (specific, evidence-based strengths of this candidate for this role),
  "concerns": string[] (specific concerns, including any dimension where there wasn't enough data to score confidently),
  "summary": string (2-3 sentence overall assessment)
}

Job:
- Title: ${job.job_title}
- Seniority: ${job.seniority || "(not specified)"}
- Location: ${job.location || "(not specified)"}
- Required skills: ${job.required_skills.join(", ") || "(none listed)"}
- Preferred skills: ${job.preferred_skills.join(", ") || "(none listed)"}
- Years of experience required: ${formatExperienceRange(job.years_of_experience)}
- Education requirements: ${job.education.join(", ") || "(none listed)"}
- Certifications: ${job.certifications.join(", ") || "(none listed)"}
- Industries: ${job.industries.join(", ") || "(none listed)"}
- Key responsibilities: ${job.responsibilities.join("; ") || "(none listed)"}

Candidate:
- Name: ${candidate.name ?? "(unknown)"}
- Headline: ${candidate.headline ?? "(unknown)"}
- Current company: ${candidate.company ?? "(unknown)"}
- Location: ${candidate.location ?? "(unknown)"}
- Skills: ${candidate.skills.join(", ") || "(none listed)"}
- Years of experience: ${candidate.experience_years ?? "(unknown)"}
- Summary: ${candidate.summary ?? "(none available)"}`;
}

export async function matchCandidateToJob(
  job: MatchingJobInput,
  candidate: MatchingCandidateInput,
  provider: AIProvider,
): Promise<MatchResult> {
  const prompt = buildCandidateMatchingPrompt(job, candidate);

  const rawResponse = await provider.generateText(prompt, {
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.2,
    jsonMode: true,
  });

  return parseJsonResponse(rawResponse, matchResultSchema, "candidate-matching");
}
