import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";
import { createLogger } from "@/lib/logger";

const log = createLogger("api-portal-jobs");

/**
 * Jobs currently live on the careers portal (public.jobs). RLS only exposes
 * open, in-window postings to sourcing members, so no status filter is needed
 * beyond `open` for clarity.
 */
export const GET = withErrorHandling(async () => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .schema("public")
    .from("jobs")
    .select(
      "id, title, company_id, location, employment_type, seniority_level, summary, responsibilities, requirements, departments(name)",
    )
    .eq("status", "open")
    .order("title", { ascending: true })
    .limit(200);

  if (error) {
    log.error("Failed to load portal jobs", { error });
    return NextResponse.json(
      { error: "Failed to load careers portal jobs." },
      { status: 500 },
    );
  }

  const jobs = (data ?? []).map((j) => ({
    id: j.id,
    title: j.title,
    company_id: j.company_id,
    department: j.departments?.name ?? null,
    location: j.location,
    employment_type: j.employment_type,
    seniority_level: j.seniority_level,
    summary: j.summary,
    responsibilities: j.responsibilities ?? [],
    requirements: j.requirements ?? [],
  }));

  return NextResponse.json({ jobs });
});
