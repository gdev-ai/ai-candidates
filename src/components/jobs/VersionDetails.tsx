"use client";

import { History, Minus, Plus, Search, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import {
  diffSnapshots,
  hasChanges,
  SNAPSHOT_FIELD_LABELS,
  type JobVersionSnapshot,
  type JobVersionSummary,
} from "@/lib/jobs/versions";
import { cn } from "@/lib/utils";
import {
  REQUIREMENT_KIND_LABELS,
  REQUIREMENT_KINDS,
  SENIORITY_LABELS,
  type RequirementKind,
  type Seniority,
} from "@/types/job";

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function experience(s: JobVersionSnapshot): string {
  const { min_experience: min, max_experience: max } = s;
  if (min === null && max === null) return "—";
  if (min !== null && max !== null) return `${min}–${max} years`;
  return min !== null ? `${min}+ years` : `Up to ${max} years`;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm text-foreground">
        {value || "—"}
      </dd>
    </div>
  );
}

function Changes({
  from,
  to,
}: {
  from: JobVersionSnapshot;
  to: JobVersionSnapshot;
}) {
  const changes = diffSnapshots(from, to);
  if (!hasChanges(changes)) {
    return (
      <p className="text-xs text-muted-foreground">
        Same details as the previous version.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5 text-xs">
      {changes.fields.map((c) => (
        <li key={c.field} className="text-foreground">
          <span className="font-medium">{SNAPSHOT_FIELD_LABELS[c.field]}</span>
          {c.field === "description" ? (
            " updated"
          ) : (
            <>
              :{" "}
              <span className="text-muted-foreground line-through">
                {c.from}
              </span>{" "}
              → {c.to}
            </>
          )}
        </li>
      ))}
      {changes.added.map((r) => (
        <li
          key={`+${r.kind}${r.text}`}
          className="flex items-start gap-1.5 text-emerald-700"
        >
          <Plus className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            {r.text}{" "}
            <span className="text-muted-foreground">
              ({REQUIREMENT_KIND_LABELS[r.kind as RequirementKind] ?? r.kind})
            </span>
          </span>
        </li>
      ))}
      {changes.removed.map((r) => (
        <li
          key={`-${r.kind}${r.text}`}
          className="flex items-start gap-1.5 text-red-700"
        >
          <Minus className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="line-through">
            {r.text}{" "}
            <span className="text-muted-foreground no-underline">
              ({REQUIREMENT_KIND_LABELS[r.kind as RequirementKind] ?? r.kind})
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Read-only view of a job's search versions: what each one searched with,
 * what changed from the one before, and the searches it ran.
 */
export function VersionDetails({
  versions,
  initialVersionId,
  companyName,
  onClose,
  onShowCandidates,
}: {
  versions: JobVersionSummary[];
  initialVersionId: string | null;
  companyName: (id: string | null) => string | null;
  onClose: () => void;
  /** Filters the candidates list to this version and closes. */
  onShowCandidates: (versionId: string) => void;
}) {
  const latest = versions[versions.length - 1];
  const [selectedId, setSelectedId] = useState(
    initialVersionId ?? latest?.id ?? null,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const index = versions.findIndex((v) => v.id === selectedId);
  const version = versions[index];
  const previous = index > 0 ? versions[index - 1] : undefined;
  if (!version) return null;
  const s = version.snapshot;

  const byKind = REQUIREMENT_KINDS.map((kind) => ({
    kind,
    items: s.requirements.filter((r) => r.kind === kind),
  })).filter((g) => g.items.length > 0);

  // Portaled to <body>: a transformed ancestor (the page-enter animation)
  // would otherwise turn `fixed` into "fixed to that ancestor".
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search versions"
        onClick={(e) => e.stopPropagation()}
        className="sp-pop flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl"
        data-testid="version-details"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <History className="h-4 w-4" aria-hidden="true" />
              Search versions
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Read-only. Each version is the job details a search ran with;
              later versions never re-add earlier candidates.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-5 py-3">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedId(v.id)}
              aria-pressed={v.id === selectedId}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium leading-5 transition-colors",
                v.id === selectedId
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              v{v.version}
              {v.id === latest?.id && " · current"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm text-foreground">
                <span className="font-semibold">{version.candidates}</span>{" "}
                candidates found ·{" "}
                <span className="font-semibold">{version.scored}</span> scored
              </p>
              <p className="text-xs text-muted-foreground">
                Created {formatDate(version.created_at)}
                {version.created_by_name && ` by ${version.created_by_name}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onShowCandidates(version.id)}
              disabled={version.candidates === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              data-testid="version-show-candidates"
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              Show v{version.version} candidates
            </button>
          </div>

          {previous && (
            <section className="rounded-lg border border-border bg-muted/40 p-3">
              <h3 className="mb-2 text-xs font-semibold text-foreground">
                Changes from v{previous.version}
              </h3>
              <Changes from={previous.snapshot} to={s} />
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Job details
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Field label="Title" value={s.title} />
              <Field label="Company" value={companyName(s.company_id)} />
              <Field
                label="Seniority"
                value={
                  s.seniority
                    ? (SENIORITY_LABELS[s.seniority as Seniority] ??
                      s.seniority)
                    : null
                }
              />
              <Field label="Experience" value={experience(s)} />
              <Field label="Employment type" value={s.employment_type} />
              <Field label="Work arrangement" value={s.work_arrangement} />
              <Field label="City" value={s.city ?? "Anywhere in Egypt"} />
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Requirements
            </h3>
            {byKind.length === 0 ? (
              <p className="text-xs text-muted-foreground">None.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {byKind.map((g) => (
                  <div key={g.kind}>
                    <p className="mb-1.5 text-xs font-medium text-foreground">
                      {REQUIREMENT_KIND_LABELS[g.kind]}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map((r, i) => (
                        <Badge
                          key={`${r.text}${i}`}
                          tone="neutral"
                          className="font-normal"
                        >
                          {r.text}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Searches
            </h3>
            {version.searches.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No searches with this version yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {version.searches.map((run) => (
                  <li
                    key={run.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-foreground">
                        {formatDate(run.created_at)}
                      </span>
                      <span className="text-muted-foreground">
                        {run.status === "complete"
                          ? `${run.candidates_found} found`
                          : run.status}
                      </span>
                    </div>
                    {run.queries.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {run.queries.map((q) => (
                          <li
                            key={q}
                            className="flex items-start gap-1.5 break-all font-mono text-[11px] text-muted-foreground"
                          >
                            <Search
                              className="mt-0.5 h-3 w-3 shrink-0"
                              aria-hidden="true"
                            />
                            {q}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
