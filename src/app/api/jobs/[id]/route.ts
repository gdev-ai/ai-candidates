import { NextResponse } from "next/server";

import { loadJobOwner } from "@/app/api/jobs/_lib/candidates";
import { logActivity } from "@/lib/activity/log";
import { requireUser } from "@/lib/api/requireUser";
import { describeOwnership, forbidUnlessOwner } from "@/lib/auth/ownership";
import { withErrorHandling } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import {
  JOB_COLUMNS,
  jobUpdateSchema,
  type JobDetailResponse,
  type JobRequirementRecord,
} from "@/types/job";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const log = createLogger("api-job");

export const GET = withErrorHandling(
  async (_request: Request, { params }: RouteParams) => {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { supabase, user } = auth;
    const { id } = await params;

    const { data: job, error } = await supabase
      .from("jobs")
      .select(JOB_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      log.error("Failed to load job", { error });
      return NextResponse.json(
        { error: "Failed to load job." },
        { status: 500 },
      );
    }
    if (!job)
      return NextResponse.json({ error: "Job not found." }, { status: 404 });

    const [requirements, analysis, company, ownership] = await Promise.all([
      supabase
        .from("job_requirements")
        .select("id, kind, text, sort_order")
        .eq("job_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("job_analyses")
        .select("id, model, prompt_version, output, created_at")
        .eq("job_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      job.company_id
        ? supabase
            .schema("public")
            .from("companies")
            .select("id, name")
            .eq("id", job.company_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      describeOwnership(supabase, job.owner_id, user.id),
    ]);

    if (requirements.error) {
      log.error("Failed to load job requirements", {
        error: requirements.error,
      });
      return NextResponse.json(
        { error: "Failed to load job." },
        { status: 500 },
      );
    }

    const body: JobDetailResponse = {
      job,
      company: company.data ?? null,
      requirements: (requirements.data ?? []) as JobRequirementRecord[],
      analysis: analysis.data ?? null,
      ...ownership,
    };
    return NextResponse.json(body);
  },
);

/** Owner only. `requirements`, when sent, replaces the job's whole list. */
export const PATCH = withErrorHandling(
  async (request: Request, { params }: RouteParams) => {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { supabase, user } = auth;
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const parsed = jobUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid job data." },
        { status: 400 },
      );
    }
    const { requirements, ...fields } = parsed.data;

    const existing = await loadJobOwner(supabase, id);
    if (existing.error)
      return NextResponse.json(
        { error: "Failed to load job." },
        { status: 500 },
      );
    if (!existing.job)
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    const forbidden = forbidUnlessOwner(existing.job.owner_id, user.id, "job");
    if (forbidden) return forbidden;

    // Only one bound is being changed: check it against the stored other bound.
    if (
      (fields.min_experience !== undefined) !==
      (fields.max_experience !== undefined)
    ) {
      const { data: current } = await supabase
        .from("jobs")
        .select("min_experience, max_experience")
        .eq("id", id)
        .single();
      const min =
        fields.min_experience !== undefined
          ? fields.min_experience
          : current?.min_experience;
      const max =
        fields.max_experience !== undefined
          ? fields.max_experience
          : current?.max_experience;
      if (min != null && max != null && min > max) {
        return NextResponse.json(
          { error: "Minimum experience can't be more than maximum." },
          { status: 400 },
        );
      }
    }

    let job = null;
    if (Object.keys(fields).length > 0) {
      const { data, error } = await supabase
        .from("jobs")
        .update(fields)
        .eq("id", id)
        .select(JOB_COLUMNS)
        .maybeSingle();
      if (error) {
        log.error("Failed to update job", { error });
        return NextResponse.json(
          { error: "Failed to update job." },
          { status: 500 },
        );
      }
      if (!data)
        return NextResponse.json({ error: "Job not found." }, { status: 404 });
      job = data;
    } else {
      const { data } = await supabase
        .from("jobs")
        .select(JOB_COLUMNS)
        .eq("id", id)
        .single();
      job = data;
    }

    if (requirements) {
      const { error: deleteError } = await supabase
        .from("job_requirements")
        .delete()
        .eq("job_id", id);
      if (deleteError) {
        log.error("Failed to replace job requirements", { error: deleteError });
        return NextResponse.json(
          { error: "Failed to update the job requirements." },
          { status: 500 },
        );
      }
      if (requirements.length > 0) {
        const { error: insertError } = await supabase
          .from("job_requirements")
          .insert(
            requirements.map((r, i) => ({
              job_id: id,
              kind: r.kind,
              text: r.text,
              sort_order: i,
            })),
          );
        if (insertError) {
          log.error("Failed to insert job requirements", {
            error: insertError,
          });
          return NextResponse.json(
            { error: "Failed to update the job requirements." },
            { status: 500 },
          );
        }
      }
    }

    const changed = [
      ...Object.keys(fields),
      ...(requirements ? ["requirements"] : []),
    ];

    // The cached job embedding is built from these; the next pre-score
    // recomputes it so shortlists follow the new version.
    if (
      changed.some((f) => ["title", "seniority", "requirements"].includes(f))
    ) {
      await supabase.from("jobs").update({ embedding: null }).eq("id", id);
    }
    if (changed.length > 0) {
      await logActivity(supabase, {
        userId: user.id,
        action: "job.updated",
        entityType: "job",
        entityId: id,
        description: `Updated job "${job?.title ?? existing.job.title}"`,
        metadata: { fields: changed },
      });
    }

    return NextResponse.json({ job });
  },
);

/** Owner only. Requirements, runs, pipeline rows, matches and notes cascade. */
export const DELETE = withErrorHandling(
  async (_request: Request, { params }: RouteParams) => {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { supabase, user } = auth;
    const { id } = await params;

    const existing = await loadJobOwner(supabase, id);
    if (existing.error)
      return NextResponse.json(
        { error: "Failed to load job." },
        { status: 500 },
      );
    if (!existing.job)
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    const forbidden = forbidUnlessOwner(existing.job.owner_id, user.id, "job");
    if (forbidden) return forbidden;

    const { data, error } = await supabase
      .from("jobs")
      .delete()
      .eq("id", id)
      .select("id, title")
      .maybeSingle();
    if (error) {
      log.error("Failed to delete job", { error });
      return NextResponse.json(
        { error: "Failed to delete job." },
        { status: 500 },
      );
    }
    if (!data)
      return NextResponse.json({ error: "Job not found." }, { status: 404 });

    await logActivity(supabase, {
      userId: user.id,
      action: "job.deleted",
      entityType: "job",
      entityId: id,
      description: `Deleted job "${data.title}"`,
    });

    return NextResponse.json({ success: true });
  },
);
