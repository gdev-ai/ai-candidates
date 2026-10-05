import { runStructured, type CallContext, type StructuredResult } from "@/lib/ai/structured";
import { jobAnalysisSchema, type JobAnalysis } from "@/types/job-analysis";

export const JOB_ANALYSIS_PROMPT_VERSION = "job-analysis/2026-10-04";

const INSTRUCTIONS = `You are an expert recruiter extracting structured requirements from a job description.
Use only information stated or clearly implied in the text; never invent skills, requirements or numbers.
Rules:
- job_title: the role's title as written (short, no company name).
- seniority: one of intern, junior, mid, senior, lead, manager, director, executive, or null if the text gives no signal.
- employment_type: Full-time, Part-time, Contract or Internship, or null if not stated.
- years_of_experience: numbers only when stated (e.g. "5+ years" -> minimum 5, maximum null); otherwise null.
- Skills: short phrases people write on profiles (1-4 words), e.g. "Selenium", "Financial Modeling". Required vs preferred as the text says; when unclear, required.
- education, certifications, languages, industries: short items, empty arrays when absent.
- responsibilities: up to 8 short items.
- keywords: up to 8 domain terms useful for matching that are not already skills.
- search_keywords: 2-5 alternative job titles people in this role commonly use on LinkedIn (include the main title).
- search_queries: always an empty array.
Do not output a location or city.`;

export function buildJobAnalysisInput(description: string): string {
  return `Job description:\n"""\n${description.trim()}\n"""`;
}

export async function analyzeJobDescription(
  description: string,
  context: CallContext = {},
): Promise<StructuredResult<JobAnalysis>> {
  return runStructured({
    purpose: "job_analysis",
    schema: jobAnalysisSchema,
    schemaName: "job_analysis",
    instructions: INSTRUCTIONS,
    input: buildJobAnalysisInput(description),
    effort: "low",
    maxOutputTokens: 4000,
    promptVersion: JOB_ANALYSIS_PROMPT_VERSION,
    context,
  });
}
