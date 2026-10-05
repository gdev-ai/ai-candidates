"use client";

import { Briefcase, ExternalLink, Eye, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { DashboardNav } from "@/components/dashboard/nav";
import {
  Filters,
  DEFAULT_CANDIDATE_FILTERS,
  buildFilterQueryString,
  type CandidateFilterState,
} from "@/components/candidates/Filters";
import { SkillsCell } from "@/components/candidates/SkillsCell";
import { ExportButton } from "@/components/jobs/ExportButton";
import { Avatar } from "@/components/ui/avatar";
import { Badge, matchScoreTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyCell } from "@/components/ui/empty-cell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { CANDIDATE_STATUSES } from "@/lib/candidates/statuses";
import type { JobCandidateListItem } from "@/types/candidate";
import type { JobDetailResponse, JobListItem } from "@/types/job";

const PAGE_SIZE = 10;

function buildRunFilterQueryString(filters: CandidateFilterState, runId: string | null): string {
  const params = new URLSearchParams(buildFilterQueryString(filters));
  if (runId) params.set("runId", runId);
  return params.toString();
}

function buildQueryString(filters: CandidateFilterState, page: number, runId: string | null): string {
  const params = new URLSearchParams(buildRunFilterQueryString(filters, runId));
  params.set("page", String(page));
  params.set("limit", String(PAGE_SIZE));
  return params.toString();
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })} · ${date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function JobPicker() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    fetch("/api/jobs")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error ?? "Failed to load jobs.");
          return;
        }
        setJobs(data.jobs ?? []);
      })
      .catch(() => setLoadError("Failed to load jobs."))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleDeleteJob(jobId: string) {
    setDeleteError(null);
    setDeletingId(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? "Failed to delete job.";
        setDeleteError(msg);
        toast.error(msg, "Delete Failed");
        return;
      }
      setJobs((prev) => prev.filter((job) => job.id !== jobId));
      toast.success("Job and its listing removed.", "Job Deleted");
    } catch {
      setDeleteError("Failed to delete job.");
      toast.error("Failed to delete job.");
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading jobs...</p>;
  }

  if (loadError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {loadError}
      </p>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Briefcase className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="text-sm text-muted-foreground">
          No jobs yet.{" "}
          <Link href="/jobs/new" className="font-medium text-primary underline">
            Create a job
          </Link>{" "}
          to start finding candidates.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="job-picker">
      {deleteError && (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      )}
      {jobs.map((job) => (
        <div
          key={job.id}
          className="flex flex-col gap-3 rounded-lg border border-border p-4 transition-colors hover:border-primary/40 hover:bg-accent/30 sm:flex-row sm:items-center sm:justify-between"
          data-testid="job-picker-row"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Briefcase className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{job.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{formatDateTime(job.created_at)}</span>
                {job.company_name && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{job.company_name}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>{job.city ?? "Egypt"}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {job.candidate_count} candidate{job.candidate_count === 1 ? "" : "s"}
                </span>
                {job.employment_type && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{job.employment_type}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {pendingDeleteId === job.id ? (
            <div className="flex shrink-0 items-center justify-end gap-1.5">
              <span className="text-xs text-muted-foreground">Delete this job?</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deletingId === job.id}
                onClick={() => handleDeleteJob(job.id)}
                data-testid="confirm-delete-job"
              >
                {deletingId === job.id ? "Deleting..." : "Confirm"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deletingId === job.id}
                onClick={() => setPendingDeleteId(null)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
              <Button asChild type="button" variant="outline" size="sm" className="gap-1.5">
                <Link href={`/candidates?jobId=${job.id}`}>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  View
                </Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setPendingDeleteId(job.id)}
                aria-label={`Delete ${job.title}`}
                data-testid="delete-job-button"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// `readOnly`: viewing someone else's file (e.g. as their manager). Edit
// controls are hidden; the API rejects edits regardless.
// `runId`: limit the list to the people one search run found (a sourcing
// file opened from the dashboard). Null shows the job's whole pipeline.
function CandidatesTable({
  jobId,
  runId,
  readOnly,
}: {
  jobId: string;
  runId: string | null;
  readOnly: boolean;
}) {
  const [candidates, setCandidates] = useState<JobCandidateListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<CandidateFilterState>(
    DEFAULT_CANDIDATE_FILTERS,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [isScoring, setIsScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scoreSummary, setScoreSummary] = useState<{
    scored: number;
    failed: number;
    strongMatches: number;
  } | null>(null);

  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    const query = buildQueryString(filters, page, runId);
    fetch(`/api/jobs/${jobId}/candidates?${query}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to load candidates.");
          return;
        }
        setCandidates(data.candidates ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to load candidates.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [jobId, runId, filters, page, refreshToken]);

  function handleFiltersChange(updated: CandidateFilterState) {
    setFilters(updated);
    setPage(1);
  }

  async function handleStatusChange(personId: string, status: string) {
    setStatusError(null);
    setUpdatingStatusId(personId);
    try {
      const res = await fetch(`/api/candidates/${personId}/status?jobId=${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? "Failed to update status.";
        setStatusError(msg);
        toast.error(msg, "Status Update Failed");
        return;
      }
      setCandidates((prev) =>
        prev.map((candidate) =>
          candidate.person_id === personId ? { ...candidate, status } : candidate,
        ),
      );
      toast.success(`Candidate status marked as "${status}"`, "Status Updated");
    } catch {
      setStatusError("Failed to update status.");
      toast.error("Failed to update status.");
    } finally {
      setUpdatingStatusId(null);
    }
  }

  async function handleDeleteCandidate(personId: string) {
    setDeleteError(null);
    setDeletingId(personId);
    try {
      const res = await fetch(`/api/candidates/${personId}?jobId=${jobId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? "Failed to delete candidate.";
        setDeleteError(msg);
        toast.error(msg, "Delete Failed");
        return;
      }
      setCandidates((prev) => prev.filter((candidate) => candidate.person_id !== personId));
      setTotal((prev) => Math.max(0, prev - 1));
      toast.success("Candidate removed from this job.", "Candidate Removed");
    } catch {
      setDeleteError("Failed to delete candidate.");
      toast.error("Failed to delete candidate.");
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  }

  async function handleScoreCandidates() {
    setIsScoring(true);
    setScoreError(null);
    setScoreSummary(null);
    toast.info("Evaluating all candidate profiles against job requirements...", "Batch Matching");

    try {
      const res = await fetch(`/api/jobs/${jobId}/match`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        const msg = data.error ?? "Failed to score candidates.";
        setScoreError(msg);
        toast.error(msg, "Match Scoring Failed");
        return;
      }

      setScoreSummary(data);
      setRefreshToken((t) => t + 1);
      toast.success(`Scored ${data.scored} candidates.`, "Match Scoring Completed");
    } catch {
      setScoreError("Failed to score candidates.");
      toast.error("Failed to score candidates.");
    } finally {
      setIsScoring(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtersUi = (
    <Filters value={filters} onChange={handleFiltersChange} />
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {filtersUi}
        <p className="text-sm text-muted-foreground">Loading candidates...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        {filtersUi}
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {filtersUi}

      {total > 0 && !readOnly && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleScoreCandidates}
            disabled={isScoring}
            className="self-start"
            data-testid="score-candidates-button"
          >
            {isScoring ? "Scoring..." : "Score Candidates"}
          </Button>
          {scoreError && (
            <p role="alert" className="text-sm text-destructive">
              {scoreError}
            </p>
          )}
          {scoreSummary && (
            <p className="text-sm text-muted-foreground" data-testid="score-summary">
              Scored {scoreSummary.scored} candidates
              {scoreSummary.strongMatches > 0 ? `, ${scoreSummary.strongMatches} strong matches` : ""}
              {scoreSummary.failed > 0 ? ` (${scoreSummary.failed} failed)` : ""}.
            </p>
          )}
        </div>
      )}

      {statusError && (
        <p role="alert" className="text-sm text-destructive">
          {statusError}
        </p>
      )}

      {deleteError && (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      )}

      {candidates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Users className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted-foreground">No candidates match these filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[1080px] text-sm" data-testid="candidates-table">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-12 p-3 font-medium text-right">#</th>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Location</th>
                <th className="p-3 font-medium">Skills</th>
                <th className="p-3 font-medium">Match</th>
                <th className="p-3 font-medium">Found</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">LinkedIn</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate, index) => (
                <tr
                  key={candidate.person_id}
                  className="border-b border-border/70 last:border-0 hover:bg-accent/40 even:bg-muted/20"
                  data-testid="candidate-row"
                >
                  <td className="p-3 text-right tabular-nums text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + index + 1}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/candidates/${candidate.person_id}?jobId=${jobId}`}
                      className="flex items-center gap-2.5 text-foreground no-underline transition-colors hover:text-primary focus-visible:text-primary"
                    >
                      <Avatar
                        src={candidate.photo_url}
                        alt={candidate.name ?? "Unnamed candidate"}
                        className="h-8 w-8 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-medium">
                          {candidate.name ?? "Unnamed candidate"}
                          {!candidate.viewed && (
                            <span
                              className="h-2 w-2 rounded-full bg-indigo-500"
                              title="Not opened yet"
                              data-testid="unseen-dot"
                            />
                          )}
                          {candidate.open_to_work && (
                            <Badge tone="good" className="font-normal">
                              Open to work
                            </Badge>
                          )}
                        </span>
                        {(candidate.current_title || candidate.current_company) && (
                          <span className="block max-w-[260px] truncate text-xs text-muted-foreground">
                            {[candidate.current_title, candidate.current_company].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      {candidate.location ?? <EmptyCell />}
                      {candidate.location_verified === true && (
                        <Badge tone="good" title="Confirmed based in Egypt">
                          Egypt verified
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <SkillsCell skills={candidate.skills} />
                  </td>
                  <td className="p-3">
                    {candidate.match_score !== null ? (
                      <Badge tone={matchScoreTone(candidate.match_score)} title={candidate.match?.summary ?? undefined}>
                        {Math.round(candidate.match_score)}%
                      </Badge>
                    ) : (
                      <EmptyCell />
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {formatDateTime(candidate.found_at)}
                  </td>
                  <td className="p-3">
                    {readOnly ? (
                      <Badge tone="neutral" data-testid="status-readonly">
                        {candidate.status}
                      </Badge>
                    ) : (
                      <Select
                        value={candidate.status}
                        onValueChange={(status) => handleStatusChange(candidate.person_id, status)}
                        disabled={updatingStatusId === candidate.person_id}
                      >
                        <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="status-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CANDIDATE_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="p-3">
                    {candidate.profile_url ? (
                      <Button asChild variant="outline" size="sm" className="gap-1.5">
                        <a href={candidate.profile_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          Profile
                        </a>
                      </Button>
                    ) : (
                      <EmptyCell />
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {pendingDeleteId === candidate.person_id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-xs text-muted-foreground">Remove?</span>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={deletingId === candidate.person_id}
                          onClick={() => handleDeleteCandidate(candidate.person_id)}
                          data-testid="confirm-delete-candidate"
                        >
                          {deletingId === candidate.person_id ? "Deleting..." : "Confirm"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={deletingId === candidate.person_id}
                          onClick={() => setPendingDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          asChild
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-primary"
                          aria-label={`View ${candidate.name ?? "candidate"}`}
                          data-testid="view-candidate-button"
                        >
                          <Link href={`/candidates/${candidate.person_id}?jobId=${jobId}`}>
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        </Button>
                        {!readOnly && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setPendingDeleteId(candidate.person_id)}
                            aria-label={`Remove ${candidate.name ?? "candidate"} from this job`}
                            data-testid="delete-candidate-button"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground" data-testid="pagination-summary">
          Page {page} of {totalPages} ({total} total)
        </p>
        <div className="flex gap-2">
          <ExportButton jobId={jobId} queryString={buildRunFilterQueryString(filters, runId)} />
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            data-testid="pagination-prev"
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            data-testid="pagination-next"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

interface JobMeta {
  title: string | null;
  canEdit: boolean;
  ownerName: string | null;
}

function CandidatesPageContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const runId = searchParams.get("runId");
  const [showRunOnly, setShowRunOnly] = useState(true);
  const [job, setJob] = useState<JobMeta | null>(null);

  useEffect(() => {
    if (!runId) return;
    fetch(`/api/search-runs/${runId}/access`, { method: "POST" }).catch(() => {
      // Best-effort: the dashboard's "Last Accessed By" simply won't
      // reflect this visit if it fails. Never blocks viewing candidates.
    });
  }, [runId]);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    const controller = new AbortController();
    setJob(null);
    fetch(`/api/jobs/${jobId}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<JobDetailResponse>) : null))
      .then((data) =>
        setJob(
          data
            ? { title: data.job.title, canEdit: data.can_edit === true, ownerName: data.owner_name ?? null }
            : null,
        ),
      )
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [jobId]);

  return (
    <main className="min-h-screen">
      <DashboardNav />
      <div className="animate-page-enter mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Candidates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review, score, and shortlist sourced candidates.
          </p>
        </div>

        {!jobId ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl">Select a job</CardTitle>
            </CardHeader>
            <CardContent>
              <JobPicker />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl">
                Candidates for {job?.title ?? "this job"}
              </CardTitle>
              {job && !job.canEdit && (
                <p
                  className="mt-2 inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm text-indigo-800"
                  data-testid="readonly-banner"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Viewing {job.ownerName ? `${job.ownerName}'s` : "a teammate's"} sourcing file ·
                  read-only
                </p>
              )}
            </CardHeader>
            <CardContent>
              {/* Read-only until the job loads, so edit controls never flash for a viewer. */}
              {runId && showRunOnly && (
                <p
                  className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
                  data-testid="run-filter-banner"
                >
                  Showing candidates found by this search run.
                  <button
                    type="button"
                    onClick={() => setShowRunOnly(false)}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    Show all candidates for this job
                  </button>
                </p>
              )}
              <CandidatesTable
                jobId={jobId}
                runId={runId && showRunOnly ? runId : null}
                readOnly={!job?.canEdit}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function CandidatesPageSkeleton() {
  return (
    <main className="min-h-screen">
      <DashboardNav />
      <div className="animate-page-enter mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Candidates
        </h1>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </main>
  );
}

export default function CandidatesPage() {
  return (
    <Suspense fallback={<CandidatesPageSkeleton />}>
      <CandidatesPageContent />
    </Suspense>
  );
}
