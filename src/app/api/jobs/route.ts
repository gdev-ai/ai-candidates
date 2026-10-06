import { NextResponse } from "next/server";

import { extractAnalysisOutput } from "@/app/api/jobs/_lib/analysis";
import { logActivity } from "@/lib/activity/log";
import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database.types";
import { JOB_COLUMNS, jobCreateSchema, type JobListItem } from "@/types/job";

const log = createLogger("api-jobs");

/**
 * Lists jobs, newest first. Default: the caller's own jobs (the personal
 * workspace). `?scope=visible` returns everything RLS lets them read —
 * their team's jobs for a manager, every job for an admin.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(
    1,
    Math.floor(Number(searchParams.get("page") ?? "1")) || 1,
  );
  const limit = Math.min(
    100,
    Math.max(1, Math.floor(Number(searchParams.get("limit") ?? "20")) || 20),
  );
  const from = (page - 1) * limit;

  let query = supabase
    .from("jobs")
    .select(
      "id, title, company_id, city, employment_type, work_arrangement, seniority, created_at, job_candidates(count)",
      { count: "exact" },
    )
    .range(from, from + limit - 1);
  const sortBy =
    searchParams.get("sort_by") === "title" ? "title" : "created_at";
  const sortDir = searchParams.get("sort_dir");
  // Newest first by default; A → Z by default when sorting by title.
  const ascending = sortDir ? sortDir === "asc" : sortBy === "title";
  query = query.order(sortBy, { ascending }).order("id");
  if (searchParams.get("scope") !== "visible")
    query = query.eq("owner_id", user.id);

  const city = searchParams.get("city");
  if (city) query = query.eq("city", city);
  const employmentType = searchParams.get("employment_type");
  if (employmentType) query = query.eq("employment_type", employmentType);
  const seniority = searchParams.get("seniority");
  if (seniority) query = query.eq("seniority", seniority);

  // Free-text search: job title or company name. Characters that are
  // syntax in a PostgREST `or` filter or an ilike pattern are dropped.
  const q = (searchParams.get("q") ?? "").replace(/[,()%*_\\]/g, " ").trim();
  if (q) {
    const { data: matchingCompanies } = await supabase
      .schema("public")
      .from("companies")
      .select("id")
      .ilike("name", `%${q}%`)
      .limit(200);
    const matchingIds = (matchingCompanies ?? []).map((c) => c.id);
    query = query.or(
      matchingIds.length > 0
        ? `title.ilike.%${q}%,company_id.in.(${matchingIds.join(",")})`
        : `title.ilike.%${q}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) {
    log.error("Failed to load jobs", { error });
    return NextResponse.json(
      { error: "Failed to load jobs." },
      { status: 500 },
    );
  }

  const companyIds = [
    ...new Set(
      (data ?? []).map((j) => j.company_id).filter((id): id is string => !!id),
    ),
  ];
  const companyNames = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .schema("public")
      .from("companies")
      .select("id, name")
      .in("id", companyIds);
    for (const c of companies ?? []) companyNames.set(c.id, c.name);
  }

  const jobs: JobListItem[] = (data ?? []).map((j) => ({
    id: j.id,
    title: j.title,
    company_id: j.company_id,
    company_name: j.company_id
      ? (companyNames.get(j.company_id) ?? null)
      : null,
    city: j.city,
    employment_type: j.employment_type,
    work_arrangement: j.work_arrangement,
    seniority: j.seniority,
    created_at: j.created_at,
    candidate_count: j.job_candidates?.[0]?.count ?? 0,
  }));

  return NextResponse.json({ jobs, total: count ?? 0, page, limit });
});

/**
 * Creates a job and its requirements. When `analysisCallId` is given, the
 * analysis stored with the job is copied server-side from that
 * provider_calls row — never taken from the client.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = jobCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid job data." },
      { status: 400 },
    );
  }
  const { requirements, analysisCallId, ...fields } = parsed.data;

  // Users can't read or write provider_calls / job_analyses, so the
  // service client does it — scoped to this user's own successful call.
  const service = analysisCallId ? createServiceClient() : null;
  let analysisCall: {
    id: string;
    model: string | null;
    prompt_version: string | null;
    output: Json;
  } | null = null;
  if (service && analysisCallId) {
    const { data: call, error: callError } = await service
      .from("provider_calls")
      .select("id, user_id, purpose, status, model, prompt_version, response")
      .eq("id", analysisCallId)
      .maybeSingle();
    if (callError) {
      log.error("Failed to load analysis call", { error: callError });
      return NextResponse.json(
        { error: "Failed to load the job analysis." },
        { status: 500 },
      );
    }
    const output = call ? extractAnalysisOutput(call.response) : null;
    if (
      !call ||
      call.user_id !== user.id ||
      call.purpose !== "job_analysis" ||
      call.status !== "ok" ||
      !output
    ) {
      return NextResponse.json(
        {
          error:
            "That job analysis can't be used. Analyze the description again.",
        },
        { status: 400 },
      );
    }
    analysisCall = {
      id: call.id,
      model: call.model,
      prompt_version: call.prompt_version,
      output: output as Json,
    };
  }

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({ ...fields, owner_id: user.id, country_code: "EG" })
    .select(JOB_COLUMNS)
    .single();

  if (error || !job) {
    log.error("Failed to create job", { error });
    const status = error?.code === "23503" ? 400 : 500;
    return NextResponse.json(
      {
        error:
          status === 400
            ? "The selected company doesn't exist."
            : "Failed to create job.",
      },
      { status },
    );
  }

  if (requirements.length > 0) {
    const { error: reqError } = await supabase.from("job_requirements").insert(
      requirements.map((r, i) => ({
        job_id: job.id,
        kind: r.kind,
        text: r.text,
        sort_order: i,
      })),
    );
    if (reqError) {
      log.error("Failed to save job requirements", { error: reqError });
      await supabase.from("jobs").delete().eq("id", job.id);
      return NextResponse.json(
        { error: "Failed to save the job requirements." },
        { status: 500 },
      );
    }
  }

  if (service && analysisCall) {
    const { error: analysisError } = await service.from("job_analyses").insert({
      job_id: job.id,
      provider_call_id: analysisCall.id,
      model: analysisCall.model ?? "unknown",
      prompt_version: analysisCall.prompt_version ?? "unknown",
      output: analysisCall.output,
    });
    if (analysisError) {
      // The job and its (recruiter-reviewed) requirements are saved; only
      // the audit copy of the AI output is missing. Don't fail the request.
      log.error("Failed to store job analysis", {
        error: analysisError,
        jobId: job.id,
      });
    }
    await service
      .from("provider_calls")
      .update({ job_id: job.id })
      .eq("id", analysisCall.id)
      .is("job_id", null);
  }

  await logActivity(supabase, {
    userId: user.id,
    action: "job.created",
    entityType: "job",
    entityId: job.id,
    description: `Created job "${job.title}"`,
  });

  return NextResponse.json({ job }, { status: 201 });
});
