"use client";

import {
  BadgeCheck,
  Briefcase,
  ExternalLink,
  Eye,
  History,
  MapPin,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DashboardNav } from "@/components/dashboard/nav";
import {
  Filters,
  DEFAULT_CANDIDATE_FILTERS,
  buildFilterQueryString,
  type CandidateFilterState,
  type VersionOption,
} from "@/components/candidates/Filters";
import {
  ScoreBatchBanner,
  ScoringBadge,
  useScoreBatch,
} from "@/components/candidates/ScoreBatch";
import { ScoreFeedback } from "@/components/candidates/ScoreFeedback";
import { SkillsCell } from "@/components/candidates/SkillsCell";
import { VersionDetails } from "@/components/jobs/VersionDetails";
import { ExportButton } from "@/components/jobs/ExportButton";
import { Avatar } from "@/components/ui/avatar";
import { Badge, matchScoreTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClickableRow } from "@/components/ui/clickable-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { CANDIDATE_STATUSES } from "@/lib/candidates/statuses";
import type { JobVersionSummary } from "@/lib/jobs/versions";
import { cn } from "@/lib/utils";
import type { JobCandidateListItem } from "@/types/candidate";
import {
  CANDIDATES_PER_RUN,
  type JobDetailResponse,
  type JobListItem,
} from "@/types/job";

const PAGE_SIZE = 10;

/** Rows of the cross-job list also carry their job's title. */
type CandidateRow = JobCandidateListItem & { job_title?: string };

/** A person can be in several jobs, so rows are keyed by both. */
function rowKey(row: Pick<CandidateRow, "job_id" | "person_id">): string {
  return `${row.job_id}:${row.person_id}`;
}

function buildRunFilterQueryString(
  filters: CandidateFilterState,
  runId: string | null,
  versionId: string | null,
): string {
  const params = new URLSearchParams(buildFilterQueryString(filters));
  if (runId) params.set("runId", runId);
  if (versionId) params.set("versionId", versionId);
  return params.toString();
}

function buildQueryString(
  filters: CandidateFilterState,
  page: number,
  runId: string | null,
  versionId: string | null,
): string {
  const params = new URLSearchParams(
    buildRunFilterQueryString(filters, runId, versionId),
  );
  params.set("page", String(page));
  params.set("limit", String(PAGE_SIZE));
  return params.toString();
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

// `readOnly`: viewing someone else's file (e.g. as their manager). Edit
// controls are hidden; the API rejects edits regardless.
// `jobId`: null lists candidates across all the caller's jobs (no scoring,
// versions or export there; those are per job).
// `runId`: limit the list to the people one search run found (a sourcing
// file opened from the dashboard). Null shows the job's whole pipeline.
function CandidatesTable({
  jobId,
  runId,
  versionId,
  versions,
  onVersionChange,
  readOnly,
}: {
  jobId: string | null;
  runId: string | null;
  versionId: string | null;
  /** Offered as a filter; omitted while a search run is pinned. */
  versions: VersionOption[];
  onVersionChange: (versionId: string | null) => void;
  readOnly: boolean;
}) {
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<CandidateFilterState>(
    DEFAULT_CANDIDATE_FILTERS,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [unscored, setUnscored] = useState(0);
  // Picked for "Score selected"; kept across pages, at most one batch.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);
  const { batch, starting, start } = useScoreBatch(jobId, refresh);
  const inBatch = new Set(batch?.personIds ?? []);

  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Refreshes while a batch scores keep the table on screen.
    if (refreshToken === 0) setIsLoading(true);
    setError(null);
    const query = buildQueryString(filters, page, runId, versionId);
    const url = jobId
      ? `/api/jobs/${jobId}/candidates?${query}`
      : `/api/candidates?${query}`;
    fetch(url, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to load candidates.");
          return;
        }
        setCandidates(data.candidates ?? []);
        setTotal(data.total ?? 0);
        setUnscored(data.unscored ?? 0);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to load candidates.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [jobId, runId, versionId, filters, page, refreshToken]);

  useEffect(() => {
    setSelected(new Set());
    setPage(1);
  }, [jobId, versionId, runId]);

  function handleFiltersChange(updated: CandidateFilterState) {
    setFilters(updated);
    setPage(1);
  }

  async function handleStatusChange(row: CandidateRow, status: string) {
    setStatusError(null);
    setUpdatingStatusId(rowKey(row));
    try {
      const res = await fetch(
        `/api/candidates/${row.person_id}/status?jobId=${row.job_id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? "Failed to update status.";
        setStatusError(msg);
        toast.error(msg, "Status Update Failed");
        return;
      }
      setCandidates((prev) =>
        prev.map((candidate) =>
          rowKey(candidate) === rowKey(row)
            ? { ...candidate, status }
            : candidate,
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

  async function handleDeleteCandidate(row: CandidateRow) {
    setDeleteError(null);
    setDeletingId(rowKey(row));
    try {
      const res = await fetch(
        `/api/candidates/${row.person_id}?jobId=${row.job_id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? "Failed to delete candidate.";
        setDeleteError(msg);
        toast.error(msg, "Delete Failed");
        return;
      }
      setCandidates((prev) =>
        prev.filter((candidate) => rowKey(candidate) !== rowKey(row)),
      );
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

  function toggleSelected(personId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else if (next.size < CANDIDATES_PER_RUN) next.add(personId);
      return next;
    });
  }

  const pageSelectable = candidates
    .map((c) => c.person_id)
    .filter((id) => !inBatch.has(id));
  const pageAllSelected =
    pageSelectable.length > 0 && pageSelectable.every((id) => selected.has(id));

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) {
        for (const id of pageSelectable) next.delete(id);
      } else {
        for (const id of pageSelectable) {
          if (next.size >= CANDIDATES_PER_RUN) break;
          next.add(id);
        }
      }
      return next;
    });
  }

  async function scoreSelected() {
    if (await start({ personIds: [...selected] })) setSelected(new Set());
  }

  async function scoreNext() {
    await start(versionId ? { versionId } : {});
  }

  const canScore = !readOnly && jobId !== null;
  const nextCount = Math.min(CANDIDATES_PER_RUN, unscored);
  const busy = starting || Boolean(batch);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtersUi = (
    <Filters
      value={filters}
      onChange={handleFiltersChange}
      versions={versions}
      versionId={versionId}
      onVersionChange={onVersionChange}
    />
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {filtersUi}
        <TableSkeleton
          rows={PAGE_SIZE}
          columns={jobId ? 4 : 5}
          avatar
          label="Loading candidates…"
        />
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

      {canScore && total > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {selected.size > 0 ? (
            <div
              className="sp-fade-up flex flex-wrap items-center gap-3 rounded-lg bg-foreground px-3 py-2 text-sm text-background"
              data-testid="selection-bar"
            >
              <span className="font-medium tabular-nums">
                {selected.size} selected
                {selected.size >= CANDIDATES_PER_RUN && (
                  <span className="ml-1 font-normal opacity-70">
                    (max {CANDIDATES_PER_RUN})
                  </span>
                )}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={scoreSelected}
                disabled={busy}
                className="border-background/30 bg-background text-foreground hover:bg-background/90"
                data-testid="score-selected-button"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Score selected
              </Button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
              >
                Clear
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={scoreNext}
              disabled={busy || nextCount === 0}
              data-testid="score-next-button"
              title={
                nextCount === 0
                  ? "Everyone here is already scored."
                  : "Reads and AI-scores the most promising unscored candidates."
              }
            >
              <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {nextCount === 0 ? "All scored" : `Score ${nextCount} more`}
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            {selected.size > 0
              ? "Scores the selected candidates against the current version"
              : `${unscored} unscored here · tick candidates to score specific people`}{" "}
            · uses 1 credit
          </span>
        </div>
      )}

      {batch && <ScoreBatchBanner batch={batch} />}

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
          <p className="text-sm text-muted-foreground">
            No candidates match these filters.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table
            className="w-full min-w-[760px] text-sm"
            data-testid="candidates-table"
          >
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                {canScore && (
                  <th className="w-10 p-3">
                    <input
                      type="checkbox"
                      checked={pageAllSelected}
                      onChange={togglePage}
                      disabled={pageSelectable.length === 0}
                      aria-label="Select candidates on this page"
                      className="h-4 w-4 cursor-pointer accent-foreground"
                    />
                  </th>
                )}
                <th className="p-3 font-medium">Candidate</th>
                {!jobId && <th className="p-3 font-medium">Job</th>}
                <th className="hidden p-3 font-medium md:table-cell">Skills</th>
                <th className="p-3 font-medium">Match</th>
                <th className="p-3 font-medium">Status</th>
                <th className="w-px p-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <ClickableRow
                  key={rowKey(candidate)}
                  href={`/candidates/${candidate.person_id}?jobId=${candidate.job_id}`}
                  className={cn(
                    "border-b border-border/70 last:border-0 hover:bg-accent/40 even:bg-muted/20",
                    selected.has(candidate.person_id) &&
                      "bg-accent/60 even:bg-accent/60",
                  )}
                  data-testid="candidate-row"
                >
                  {canScore && (
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(candidate.person_id)}
                        onChange={() => toggleSelected(candidate.person_id)}
                        disabled={
                          inBatch.has(candidate.person_id) ||
                          (!selected.has(candidate.person_id) &&
                            selected.size >= CANDIDATES_PER_RUN)
                        }
                        aria-label={`Select ${candidate.name ?? "candidate"}`}
                        className="h-4 w-4 cursor-pointer accent-foreground disabled:cursor-not-allowed"
                        data-testid="candidate-checkbox"
                      />
                    </td>
                  )}
                  <td className="p-3 align-top">
                    <div className="flex items-start gap-3">
                      <Link
                        href={`/candidates/${candidate.person_id}?jobId=${candidate.job_id}`}
                        className="shrink-0"
                        tabIndex={-1}
                        aria-hidden="true"
                      >
                        <Avatar
                          src={candidate.photo_url}
                          alt=""
                          className="h-9 w-9"
                        />
                      </Link>
                      <div className="min-w-0">
                        <Link
                          href={`/candidates/${candidate.person_id}?jobId=${candidate.job_id}`}
                          className="flex items-center gap-1.5 font-medium text-foreground no-underline transition-colors hover:text-primary focus-visible:text-primary"
                        >
                          <span className="truncate">
                            {candidate.name ?? "Unnamed candidate"}
                          </span>
                          {!candidate.viewed && (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-indigo-500"
                              title="Not opened yet"
                              data-testid="unseen-dot"
                            />
                          )}
                          {candidate.open_to_work && (
                            <Badge tone="good" className="shrink-0 font-normal">
                              Open to work
                            </Badge>
                          )}
                        </Link>
                        {(candidate.current_title ||
                          candidate.current_company) && (
                          <p className="max-w-[340px] truncate text-xs text-muted-foreground">
                            {[
                              candidate.current_title,
                              candidate.current_company,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex max-w-[220px] items-center gap-1">
                            <MapPin
                              className="h-3 w-3 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="truncate">
                              {candidate.location ?? "Location unknown"}
                            </span>
                            {candidate.location_verified === true && (
                              <BadgeCheck
                                className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                                aria-label="Confirmed based in Egypt"
                              />
                            )}
                          </span>
                          {candidate.version !== null && (
                            <span
                              className="rounded border border-border px-1 font-mono"
                              title={`Found by search version ${candidate.version}`}
                            >
                              v{candidate.version}
                            </span>
                          )}
                          <span title={formatDateTime(candidate.found_at)}>
                            Found {formatShortDate(candidate.found_at)}
                          </span>
                        </p>
                      </div>
                    </div>
                  </td>
                  {!jobId && (
                    <td className="p-3 align-top">
                      <Link
                        href={`/candidates?jobId=${candidate.job_id}`}
                        className="line-clamp-2 max-w-[180px] text-xs text-muted-foreground no-underline transition-colors hover:text-primary"
                        title="Show only this job's candidates"
                      >
                        {candidate.job_title || "—"}
                      </Link>
                    </td>
                  )}
                  <td className="hidden p-3 align-top md:table-cell">
                    <SkillsCell skills={candidate.skills} />
                  </td>
                  <td className="p-3 align-top">
                    {inBatch.has(candidate.person_id) &&
                    batch?.progress?.status !== "complete" ? (
                      <ScoringBadge />
                    ) : candidate.match_score !== null ? (
                      <div className="flex flex-col items-start gap-1">
                        <Badge
                          tone={matchScoreTone(candidate.match_score)}
                          title={candidate.match?.summary ?? undefined}
                        >
                          {Math.round(candidate.match_score)}%
                        </Badge>
                        {candidate.match && (
                          <ScoreFeedback
                            variant="compact"
                            matchId={candidate.match.id}
                            initial={candidate.match.my_feedback}
                          />
                        )}
                      </div>
                    ) : candidate.enrichment_status === "pending" ? (
                      <Badge
                        tone="warning"
                        className="whitespace-nowrap font-normal"
                        title="The monthly enrichment budget is used up, so this profile (and its photo) hasn't been read. Score it again once the budget resets."
                      >
                        Waiting for enrichment budget
                      </Badge>
                    ) : (
                      <Badge
                        tone="neutral"
                        className="whitespace-nowrap font-normal"
                        title="Found by the search but not AI-scored yet. Tick it and use Score selected, or Score more."
                      >
                        Not scored
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 align-top">
                    {readOnly ? (
                      <Badge tone="neutral" data-testid="status-readonly">
                        {candidate.status}
                      </Badge>
                    ) : (
                      <Select
                        value={candidate.status}
                        onValueChange={(status) =>
                          handleStatusChange(candidate, status)
                        }
                        disabled={updatingStatusId === rowKey(candidate)}
                      >
                        <SelectTrigger
                          className="h-8 w-[128px] text-xs"
                          data-testid="status-select"
                        >
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
                  <td className="p-3 text-right align-top">
                    {pendingDeleteId === rowKey(candidate) ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          Remove?
                        </span>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={deletingId === rowKey(candidate)}
                          onClick={() => handleDeleteCandidate(candidate)}
                          data-testid="confirm-delete-candidate"
                        >
                          {deletingId === rowKey(candidate)
                            ? "Deleting..."
                            : "Confirm"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={deletingId === rowKey(candidate)}
                          onClick={() => setPendingDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-0.5">
                        {candidate.profile_url && (
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-primary"
                            title="LinkedIn profile"
                          >
                            <a
                              href={candidate.profile_url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`${candidate.name ?? "Candidate"} on LinkedIn`}
                            >
                              <ExternalLink
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </a>
                          </Button>
                        )}
                        <Button
                          asChild
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-primary"
                          aria-label={`View ${candidate.name ?? "candidate"}`}
                          data-testid="view-candidate-button"
                        >
                          <Link
                            href={`/candidates/${candidate.person_id}?jobId=${candidate.job_id}`}
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        </Button>
                        {!readOnly && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setPendingDeleteId(rowKey(candidate))
                            }
                            aria-label={`Remove ${candidate.name ?? "candidate"} from this job`}
                            data-testid="delete-candidate-button"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p
          className="text-sm text-muted-foreground"
          data-testid="pagination-summary"
        >
          Page {page} of {totalPages} ({total} total)
        </p>
        <div className="flex gap-2">
          {jobId && (
            <ExportButton
              jobId={jobId}
              queryString={buildRunFilterQueryString(filters, runId, versionId)}
            />
          )}
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

interface JobOption {
  id: string;
  title: string;
  candidates: number;
}

const ALL_JOBS_VALUE = "all";

/** Narrows the list to one job; "All jobs" shows every job's candidates. */
function JobSelect({
  jobs,
  value,
  currentTitle,
  onChange,
}: {
  jobs: JobOption[];
  value: string | null;
  /** Keeps a job outside the list (e.g. a teammate's) selectable. */
  currentTitle: string | null;
  onChange: (jobId: string | null) => void;
}) {
  const options =
    value && !jobs.some((j) => j.id === value)
      ? [
          { id: value, title: currentTitle ?? "This job", candidates: -1 },
          ...jobs,
        ]
      : jobs;
  return (
    <Select
      value={value ?? ALL_JOBS_VALUE}
      onValueChange={(v) => onChange(v === ALL_JOBS_VALUE ? null : v)}
    >
      <SelectTrigger className="h-9 w-[240px]" data-testid="filter-job">
        <span className="flex min-w-0 items-center gap-2">
          <Briefcase
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="truncate">
            <SelectValue />
          </span>
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_JOBS_VALUE}>All jobs</SelectItem>
        {options.map((j) => (
          <SelectItem key={j.id} value={j.id}>
            {j.title}
            {j.candidates >= 0 && (
              <span className="text-muted-foreground"> · {j.candidates}</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  const [jobLoadFailed, setJobLoadFailed] = useState(false);
  const [versions, setVersions] = useState<JobVersionSummary[]>([]);
  const [versionId, setVersionId] = useState<string | null>(
    searchParams.get("versionId"),
  );
  const [showVersions, setShowVersions] = useState(false);
  const [companies, setCompanies] = useState<Map<string, string>>(
    () => new Map(),
  );
  const router = useRouter();
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/jobs?limit=100", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { jobs?: JobListItem[] } | null) =>
        setJobOptions(
          (data?.jobs ?? []).map((j) => ({
            id: j.id,
            title: j.title,
            candidates: j.candidate_count,
          })),
        ),
      )
      .catch(() => {});
    return () => controller.abort();
  }, []);

  function selectJob(id: string | null) {
    setVersionId(null);
    setShowRunOnly(true);
    router.replace(id ? `/candidates?jobId=${id}` : "/candidates", {
      scroll: false,
    });
  }

  useEffect(() => {
    if (!jobId) {
      setVersions([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/jobs/${jobId}/versions`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { versions?: JobVersionSummary[] } | null) =>
        setVersions(data?.versions ?? []),
      )
      .catch(() => {});
    return () => controller.abort();
  }, [jobId]);

  useEffect(() => {
    if (!showVersions || companies.size > 0) return;
    fetch("/api/companies")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { companies?: { id: string; name: string }[] } | null) =>
        setCompanies(
          new Map((data?.companies ?? []).map((c) => [c.id, c.name])),
        ),
      )
      .catch(() => {});
  }, [showVersions, companies.size]);

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
    setJobLoadFailed(false);
    fetch(`/api/jobs/${jobId}`, { signal: controller.signal })
      .then((res) =>
        res.ok ? (res.json() as Promise<JobDetailResponse>) : null,
      )
      .then((data) =>
        setJob(
          data
            ? {
                title: data.job.title,
                canEdit: data.can_edit === true,
                ownerName: data.owner_name ?? null,
              }
            : null,
        ),
      )
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setJobLoadFailed(true);
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

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle className="font-display text-xl">
                {!jobId ? (
                  "All candidates"
                ) : (
                  <>
                    Candidates for{" "}
                    {job ? (
                      job.title
                    ) : jobLoadFailed ? (
                      "this job"
                    ) : (
                      <Skeleton className="inline-block h-5 w-48 translate-y-0.5" />
                    )}
                  </>
                )}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <JobSelect
                  jobs={jobOptions}
                  value={jobId}
                  currentTitle={job?.title ?? null}
                  onChange={selectJob}
                />
                {jobId && versions.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowVersions(true)}
                    data-testid="version-details-button"
                  >
                    <History
                      className="mr-1.5 h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                    Versions
                  </Button>
                )}
                {jobId && job?.canEdit && (
                  <Button asChild size="sm" data-testid="adapt-search-button">
                    <Link href={`/jobs/${jobId}/adapt`}>
                      <SlidersHorizontal
                        className="mr-1.5 h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      Adapt search
                    </Link>
                  </Button>
                )}
              </div>
            </div>
            {jobId && job && !job.canEdit && (
              <p
                className="mt-2 inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm text-indigo-800"
                data-testid="readonly-banner"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                Viewing {job.ownerName
                  ? `${job.ownerName}'s`
                  : "a teammate's"}{" "}
                sourcing file · read-only
              </p>
            )}
          </CardHeader>
          <CardContent>
            {jobId && runId && showRunOnly && (
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
            {/* Read-only until the job loads, so edit controls never flash for a viewer. */}
            <CandidatesTable
              jobId={jobId}
              runId={jobId && runId && showRunOnly ? runId : null}
              versionId={runId && showRunOnly ? null : versionId}
              versions={!jobId || (runId && showRunOnly) ? [] : versions}
              onVersionChange={setVersionId}
              readOnly={jobId ? !job?.canEdit : false}
            />
            {jobId && showVersions && versions.length > 0 && (
              <VersionDetails
                versions={versions}
                initialVersionId={versionId}
                companyName={(id) => (id ? (companies.get(id) ?? null) : null)}
                onClose={() => setShowVersions(false)}
                onShowCandidates={(id) => {
                  setShowRunOnly(false);
                  setVersionId(id);
                  setShowVersions(false);
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function CandidatesPageSkeleton() {
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-9 w-52" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-36" />
              ))}
            </div>
            <TableSkeleton
              rows={PAGE_SIZE}
              columns={5}
              avatar
              label="Loading candidates…"
            />
          </CardContent>
        </Card>
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
