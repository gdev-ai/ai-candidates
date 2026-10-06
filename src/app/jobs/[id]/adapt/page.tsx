"use client";

import {
  ArrowLeft,
  GitBranch,
  Loader2,
  Minus,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DashboardNav } from "@/components/dashboard/nav";
import {
  JobDetailsFields,
  jobDetailsErrorsOf,
  type JobDetailsValue,
} from "@/components/jobs/JobDetailsFields";
import { RequirementsEditor } from "@/components/jobs/RequirementsEditor";
import {
  SearchProgress,
  type SearchPhase,
} from "@/components/jobs/SearchProgress";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { refreshCredits, useCredits } from "@/components/usage/useCredits";
import {
  FALLBACK_ESTIMATE_MINUTES,
  type RunProgress,
} from "@/lib/jobs/runProgress";
import {
  buildSnapshot,
  diffSnapshots,
  hasChanges,
  SNAPSHOT_FIELD_LABELS,
  type JobVersionSnapshot,
  type JobVersionSummary,
} from "@/lib/jobs/versions";
import { formatResetsIn } from "@/lib/usage/credits";
import {
  CANDIDATES_PER_RUN,
  REQUIREMENT_KIND_LABELS,
  type City,
  type JobDetailResponse,
  type RequirementKind,
  type RequirementsDraft,
  type Seniority,
} from "@/types/job";

const TERMINAL = new Set(["complete", "error", "cancelled"]);

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorOf(data: Record<string, unknown>, fallback: string): string {
  return typeof data.error === "string" && data.error ? data.error : fallback;
}

/**
 * Adapt search: fine-tune a job's details and requirements and search
 * again as a new version. People found by earlier versions are never
 * re-added, so the new version brings only new candidates; earlier
 * versions stay viewable (read-only) on the candidates page.
 */
export default function AdaptSearchPage() {
  const { id: jobId } = useParams<{ id: string }>();
  const router = useRouter();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [job, setJob] = useState<JobDetailResponse | null>(null);
  const [versions, setVersions] = useState<JobVersionSummary[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);

  const [details, setDetails] = useState<JobDetailsValue>({
    title: "",
    companyId: "",
    employmentType: "",
    workArrangement: "",
  });
  const [draft, setDraft] = useState<RequirementsDraft | null>(null);
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>(
    {},
  );

  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<SearchPhase | null>(null);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [estimate, setEstimate] = useState(FALLBACK_ESTIMATE_MINUTES);
  const credits = useCredits();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/jobs/${jobId}`).then(async (r) => ({
        ok: r.ok,
        data: await readJson(r),
      })),
      fetch(`/api/jobs/${jobId}/versions`).then((r) =>
        r.ok ? r.json() : { versions: [] },
      ),
    ])
      .then(([jobRes, versionsRes]) => {
        if (cancelled) return;
        if (!jobRes.ok) {
          setLoadError(errorOf(jobRes.data, "Failed to load the job."));
          return;
        }
        const detail = jobRes.data as unknown as JobDetailResponse;
        setJob(detail);
        setVersions(
          (versionsRes as { versions?: JobVersionSummary[] }).versions ?? [],
        );
        setDetails({
          title: detail.job.title,
          companyId: detail.job.company_id ?? "",
          employmentType: detail.job.employment_type ?? "",
          workArrangement: detail.job.work_arrangement ?? "",
        });
        setDraft({
          seniority: (detail.job.seniority ?? "") as Seniority | "",
          city: (detail.job.city ?? "") as City | "",
          min_experience: detail.job.min_experience,
          max_experience: detail.job.max_experience,
          requirements: detail.requirements.map((r) => ({
            kind: r.kind,
            text: r.text,
          })),
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError("Failed to load the job.");
      });
    fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { companies?: { id: string; name: string }[] } | null) => {
        if (!cancelled) setCompanies(d?.companies ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingCompanies(false);
      });
    fetch("/api/search/estimate")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { minutes?: number } | null) => {
        if (!cancelled && typeof d?.minutes === "number")
          setEstimate(d.minutes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const latest = versions[versions.length - 1] ?? null;
  const nextVersion = (latest?.version ?? 0) + 1;

  const draftSnapshot: JobVersionSnapshot | null = useMemo(
    () =>
      job && draft
        ? buildSnapshot(
            {
              title: details.title.trim(),
              description: job.job.description,
              company_id: details.companyId || null,
              employment_type: details.employmentType || null,
              work_arrangement: details.workArrangement || null,
              seniority: draft.seniority || null,
              city: draft.city || null,
              country_code: job.job.country_code,
              min_experience: draft.min_experience,
              max_experience: draft.max_experience,
            },
            draft.requirements.map((r) => ({
              kind: r.kind,
              text: r.text.trim(),
            })),
          )
        : null,
    [job, draft, details],
  );
  const changes =
    latest && draftSnapshot
      ? diffSnapshots(latest.snapshot, draftSnapshot)
      : null;
  const changed = !latest || (changes ? hasChanges(changes) : false);

  const errors = jobDetailsErrorsOf(details);
  const rangeValid =
    !draft ||
    draft.min_experience === null ||
    draft.max_experience === null ||
    draft.min_experience <= draft.max_experience;
  const valid = Object.keys(errors).length === 0 && rangeValid;
  const blocked = credits?.blocked ?? null;

  async function poll(runId: string) {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`/api/search/${runId}/status`);
        const data = await readJson(res);
        if (!res.ok) {
          toast.error(errorOf(data, "Failed to check search status."));
          setPhase(null);
          return;
        }
        const run = data as unknown as RunProgress;
        setProgress(run);
        if (TERMINAL.has(run.status)) {
          void refreshCredits();
          if (run.status === "complete") {
            setPhase("complete");
            toast.success(
              `Found ${run.candidates_found ?? 0} new candidates.`,
              `Version ${nextVersion} Complete`,
            );
          } else {
            setPhase(null);
            toast.error(run.error ?? "The search failed.", "Search Failed");
          }
          return;
        }
      } catch {
        // A dropped poll doesn't stop the run.
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    setPhase(null);
    toast.warning(
      "The search is taking longer than expected. Check back shortly.",
    );
  }

  async function handleSubmit() {
    if (!draft || !valid || submitting) {
      setTouchedFields({
        title: true,
        company: true,
        employmentType: true,
        workArrangement: true,
      });
      return;
    }
    if (blocked) {
      toast.error(blocked.reason, "Search Limit Reached");
      return;
    }
    setSubmitting(true);
    setProgress(null);
    setStartedAt(Date.now());
    setPhase("preparing");
    try {
      const patch = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: details.title.trim(),
          company_id: details.companyId,
          employment_type: details.employmentType,
          work_arrangement: details.workArrangement,
          seniority: draft.seniority,
          city: draft.city,
          min_experience: draft.min_experience,
          max_experience: draft.max_experience,
          requirements: draft.requirements,
        }),
      });
      if (!patch.ok) {
        toast.error(errorOf(await readJson(patch), "Failed to save the job."));
        setPhase(null);
        return;
      }

      const q = await fetch("/api/jobs/generate-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const qData = await readJson(q);
      const queries = Array.isArray(qData.queries)
        ? (qData.queries as unknown[]).filter(
            (x): x is string => typeof x === "string" && x.trim() !== "",
          )
        : [];
      if (!q.ok || queries.length === 0) {
        toast.error(errorOf(qData, "Failed to generate search queries."));
        setPhase(null);
        return;
      }

      const res = await fetch(`/api/jobs/${jobId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries }),
      });
      const data = await readJson(res);
      void refreshCredits();
      const run = data.run as { id: string } | undefined;
      if (!res.ok || !run) {
        toast.error(errorOf(data, "Failed to start the search."));
        setPhase(null);
        return;
      }
      setPhase("running");
      setSubmitting(false);
      await poll(run.id);
    } catch {
      toast.error("Something went wrong starting the search.");
      setPhase(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function viewNewVersion() {
    const res = await fetch(`/api/jobs/${jobId}/versions`).catch(() => null);
    const data = res?.ok
      ? ((await res.json()) as { versions?: JobVersionSummary[] })
      : null;
    const newest = data?.versions?.[data.versions.length - 1];
    router.push(
      `/candidates?jobId=${jobId}${newest ? `&versionId=${newest.id}` : ""}`,
    );
  }

  const backHref = `/candidates?jobId=${jobId}`;

  return (
    <main className="min-h-screen bg-slate-50/70 pb-24">
      <DashboardNav />
      <div className="animate-page-enter mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-2">
          <Link
            href={backHref}
            className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to candidates
          </Link>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
            Adapt search
          </h1>
          <p className="text-sm text-slate-500">
            Fine-tune what this job needs and search again as a new version.
            Candidates from earlier versions are kept and never re-added, so you
            only get new people.
          </p>
        </div>

        {loadError ? (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        ) : !job || !draft ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading the job…
          </div>
        ) : !job.can_edit ? (
          <p className="text-sm text-muted-foreground">
            Only the job&apos;s owner can adapt its search.
          </p>
        ) : (
          <>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <GitBranch className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold text-slate-900">
                        Job Details & Requirements
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        {latest
                          ? `Starting from v${latest.version}, the current version`
                          : "No searches yet"}
                      </CardDescription>
                    </div>
                  </div>
                  <span className="rounded-full bg-foreground px-2.5 py-1 font-mono text-xs text-background">
                    {changed ? `v${nextVersion}` : `v${latest?.version ?? 1}`}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <RequirementsEditor value={draft} onChange={setDraft}>
                  <JobDetailsFields
                    value={details}
                    onChange={(p) => setDetails((d) => ({ ...d, ...p }))}
                    companies={companies}
                    isLoadingCompanies={isLoadingCompanies}
                    companiesError={null}
                    touchedFields={touchedFields}
                    setTouchedFields={setTouchedFields}
                  />
                </RequirementsEditor>
              </CardContent>
            </Card>

            <Card
              className="border-slate-200 shadow-sm"
              data-testid="version-changes"
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-900">
                  {latest
                    ? changed
                      ? `What changes in v${nextVersion}`
                      : "No changes yet"
                    : "Version 1"}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-xs">
                {latest && changes && changed ? (
                  <ul className="flex flex-col gap-1.5">
                    {changes.fields.map((c) => (
                      <li key={c.field} className="text-foreground">
                        <span className="font-medium">
                          {SNAPSHOT_FIELD_LABELS[c.field]}
                        </span>
                        :{" "}
                        <span className="text-muted-foreground line-through">
                          {c.from}
                        </span>{" "}
                        → {c.to}
                      </li>
                    ))}
                    {changes.added.map((r) => (
                      <li
                        key={`+${r.kind}${r.text}`}
                        className="flex items-start gap-1.5 text-emerald-700"
                      >
                        <Plus
                          className="mt-0.5 h-3 w-3 shrink-0"
                          aria-hidden="true"
                        />
                        {r.text}
                        <span className="text-muted-foreground">
                          ({REQUIREMENT_KIND_LABELS[r.kind as RequirementKind]})
                        </span>
                      </li>
                    ))}
                    {changes.removed.map((r) => (
                      <li
                        key={`-${r.kind}${r.text}`}
                        className="flex items-start gap-1.5 text-red-700"
                      >
                        <Minus
                          className="mt-0.5 h-3 w-3 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="line-through">{r.text}</span>
                        <span className="text-muted-foreground">
                          ({REQUIREMENT_KIND_LABELS[r.kind as RequirementKind]})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    {latest
                      ? `Edit the details above to create v${nextVersion}. Searching without changes runs v${latest.version} again.`
                      : "The first search creates version 1."}
                  </p>
                )}
                <p className="text-muted-foreground">
                  The search excludes everyone already on this job
                  {latest
                    ? ` (${versions.reduce((n, v) => n + v.candidates, 0)} people from earlier versions)`
                    : ""}
                  , then AI-scores the top {CANDIDATES_PER_RUN} new ones. Takes
                  about {estimate} min and uses 1 credit.
                </p>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-end gap-3">
              {blocked && (
                <p className="mr-auto text-xs text-red-600">
                  {blocked.reason}
                  {blocked.resetsAt &&
                    ` New searches open ${formatResetsIn(blocked.resetsAt)}.`}
                </p>
              )}
              {!rangeValid && (
                <p className="mr-auto text-xs text-red-600">
                  Minimum experience can&apos;t be more than maximum.
                </p>
              )}
              <Button asChild variant="outline">
                <Link href={backHref}>Cancel</Link>
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={
                  submitting || !valid || Boolean(blocked) || Boolean(phase)
                }
                data-testid="adapt-submit"
              >
                {submitting ? (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {changed
                  ? `Save as v${nextVersion} & search`
                  : `Search v${latest?.version ?? 1} again`}
              </Button>
            </div>
          </>
        )}
      </div>

      {phase && (
        <SearchProgress
          phase={phase}
          progress={progress}
          estimateMinutes={estimate}
          startedAt={startedAt}
          candidateLimit={CANDIDATES_PER_RUN}
          jobTitle={details.title.trim()}
          location={draft?.city || "Egypt"}
          onHide={() => {
            if (phase === "complete") {
              void viewNewVersion();
              return;
            }
            // The search keeps running server-side; its candidates show up
            // on the job as they're found.
            toast.info(
              "The search keeps running. Its candidates appear on the job as they're found.",
              "Running in the Background",
            );
            router.push(backHref);
          }}
          onViewCandidates={() => void viewNewVersion()}
        />
      )}
    </main>
  );
}
