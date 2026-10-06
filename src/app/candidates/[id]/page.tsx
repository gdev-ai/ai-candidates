"use client";

import { ArrowLeft, ExternalLink, Eye, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { DashboardNav } from "@/components/dashboard/nav";
import { Avatar } from "@/components/ui/avatar";
import { Badge, matchScoreTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyCell } from "@/components/ui/empty-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { CANDIDATE_STATUSES } from "@/lib/candidates/statuses";
import { cn } from "@/lib/utils";
import type {
  CandidateDetailResponse,
  CandidateNoteRecord,
  MatchItem,
  MatchResultRecord,
  PersonExperience,
} from "@/types/candidate";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatYearMonth(year: number | null, month: number | null): string | null {
  if (!year) return null;
  return month ? `${MONTHS[month - 1]} ${year}` : String(year);
}

function experiencePeriod(e: PersonExperience): string {
  const start = formatYearMonth(e.start_year, e.start_month);
  const end = e.is_current ? "Present" : formatYearMonth(e.end_year, e.end_month);
  const range = [start, end].filter(Boolean).join(" – ");
  return [range, e.duration_text].filter(Boolean).join(" · ");
}

function formatScore(score: number | null | undefined): string | null {
  return score === null || score === undefined ? null : `${Math.round(score)}%`;
}

const ITEM_GROUPS: { status: string; label: string; tone: "good" | "warning" | "critical" }[] = [
  { status: "met", label: "Met", tone: "good" },
  { status: "partial", label: "Partially met", tone: "warning" },
  { status: "missing", label: "Missing", tone: "critical" },
];

function MatchItems({ items }: { items: MatchItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {ITEM_GROUPS.map((group) => {
        const groupItems = items.filter((i) => i.status === group.status);
        return (
          <div key={group.status}>
            <p className="mb-1 flex items-center gap-2 font-medium">
              {group.label}
              <Badge tone={group.tone}>{groupItems.length}</Badge>
            </p>
            {groupItems.length === 0 ? (
              <p className="text-muted-foreground">None.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-muted-foreground">
                {groupItems.map((item, i) => (
                  <li key={i}>
                    <span className="text-foreground">{item.text}</span>
                    {item.evidence && <span className="block text-xs">{item.evidence}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MatchCard({ matches }: { matches: MatchResultRecord[] }) {
  const [latest, ...history] = matches;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl">Match for this job</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 text-sm" data-testid="match-breakdown">
        {!latest ? (
          <p className="text-muted-foreground">Not scored for this job yet.</p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-display text-xl font-semibold",
                  matchScoreTone(latest.match_score) === "good" && "bg-emerald-100 text-emerald-700",
                  matchScoreTone(latest.match_score) === "warning" && "bg-amber-100 text-amber-700",
                  matchScoreTone(latest.match_score) === "critical" && "bg-red-100 text-red-700",
                )}
              >
                {formatScore(latest.match_score)}
              </span>
              <div>
                <p className="font-medium text-foreground">Overall match</p>
                <p className="text-muted-foreground">
                  Scored {new Date(latest.created_at).toLocaleString()} · {latest.model}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(
                [
                  ["Skills", latest.skills_score],
                  ["Experience", latest.experience_score],
                  ["Location", latest.location_score],
                  ["Education", latest.education_score],
                  ["Seniority", latest.seniority_score],
                ] as const
              ).map(([label, score]) => (
                <div key={label} className="rounded-lg border border-border p-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="font-medium text-foreground">{formatScore(score) ?? <EmptyCell />}</p>
                </div>
              ))}
            </div>
            {latest.summary && <p className="leading-relaxed">{latest.summary}</p>}
            <MatchItems items={latest.items} />
            {history.length > 0 && (
              <div>
                <p className="mb-1 font-medium">Earlier scores</p>
                <ul className="flex flex-col gap-1 text-muted-foreground" data-testid="match-history">
                  {history.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <Badge tone={matchScoreTone(m.match_score)}>{formatScore(m.match_score)}</Badge>
                      {new Date(m.created_at).toLocaleString()} · {m.model}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  );
}

function CandidateProfileContent() {
  const params = useParams<{ id: string }>();
  const personId = params.id;
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");

  const [data, setData] = useState<CandidateDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [noteDraft, setNoteDraft] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jobId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${personId}?jobId=${jobId}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to load candidate.");
        return;
      }
      setData(body as CandidateDetailResponse);
    } catch {
      setError("Failed to load candidate.");
    } finally {
      setIsLoading(false);
    }
  }, [personId, jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(status: string) {
    if (!data || !jobId) return;
    setStatusError(null);
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/candidates/${personId}/status?jobId=${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) {
        const msg = body.error ?? "Failed to update status.";
        setStatusError(msg);
        toast.error(msg, "Status Update Failed");
        return;
      }
      setData((prev) =>
        prev ? { ...prev, pipeline: { ...prev.pipeline, ...body.pipeline } } : prev,
      );
      toast.success(`Candidate status updated to "${status}"`, "Status Updated");
    } catch {
      setStatusError("Failed to update status.");
      toast.error("Failed to update status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function handleAddNote() {
    if (!noteDraft.trim() || !jobId) return;
    setNoteError(null);
    setIsSavingNote(true);
    try {
      const res = await fetch(`/api/candidates/${personId}/notes?jobId=${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteDraft }),
      });
      const body = await res.json();
      if (!res.ok) {
        const msg = body.error ?? "Failed to save note.";
        setNoteError(msg);
        toast.error(msg, "Save Note Failed");
        return;
      }
      const note = body.note as CandidateNoteRecord;
      setData((prev) => (prev ? { ...prev, notes: [note, ...prev.notes] } : prev));
      setNoteDraft("");
      toast.success("Note saved.", "Note Added");
    } catch {
      setNoteError("Failed to save note.");
      toast.error("Failed to save note.");
    } finally {
      setIsSavingNote(false);
    }
  }

  if (!jobId) {
    return (
      <main className="min-h-screen">
        <DashboardNav />
        <p role="alert" className="p-4 text-sm text-destructive">
          Open candidates from a job&apos;s candidate list.{" "}
          <Link href="/candidates" className="underline">
            Go to jobs
          </Link>
        </p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="min-h-screen">
        <DashboardNav />
        <p className="p-4 text-sm text-muted-foreground">Loading candidate...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen">
        <DashboardNav />
        <p role="alert" className="p-4 text-sm text-destructive">
          {error ?? "Candidate not found."}
        </p>
      </main>
    );
  }

  const { person, pipeline } = data;
  const name = person.full_name ?? "Unnamed candidate";
  const location = person.location_text ?? person.city;
  const roleLine = [person.current_title, person.current_company].filter(Boolean).join(" at ");

  return (
    <main className="min-h-screen">
      <DashboardNav />
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:py-8">
        <Link
          href={`/candidates?jobId=${pipeline.job_id}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Candidates for {pipeline.job_title}
        </Link>

        {!data.can_edit && (
          <p
            className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800"
            data-testid="readonly-banner"
          >
            <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
            Viewing {data.owner_name ? `${data.owner_name}'s` : "a teammate's"} candidate · read-only
          </p>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar src={person.photo_url} alt={name} className="h-16 w-16" />
                <div className="min-w-0">
                  <CardTitle className="font-display text-2xl">{name}</CardTitle>
                  {roleLine && <p className="text-base text-foreground">{roleLine}</p>}
                  {location && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {location}
                      {person.location_verified === true && (
                        <Badge tone="good" title={person.location_evidence ?? "Confirmed based in Egypt"}>
                          Egypt verified
                        </Badge>
                      )}
                    </p>
                  )}
                </div>
              </div>
              {person.profile_url ? (
                <Button asChild size="lg" className="gap-2" data-testid="linkedin-button">
                  <a href={person.profile_url} target="_blank" rel="noreferrer">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                    Open LinkedIn profile
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">No profile link</p>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {person.headline && person.headline !== roleLine && (
              <p className="text-foreground">{person.headline}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">
                {person.experience_years !== null
                  ? `${person.experience_years} yrs experience`
                  : "Experience unknown"}
              </Badge>
              {person.open_to_work && <Badge tone="good">Open to work</Badge>}
              {person.connections_count !== null && (
                <Badge tone="neutral">{person.connections_count.toLocaleString()} connections</Badge>
              )}
              {person.enrichment_status !== "enriched" && (
                <Badge tone="warning" title="Only the search result is known so far">
                  Profile not enriched
                </Badge>
              )}
            </div>
            {person.about ? (
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{person.about}</p>
            ) : (
              person.search_snippet && (
                <p className="leading-relaxed text-muted-foreground">{person.search_snippet}</p>
              )
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Pipeline status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {!data.can_edit ? (
              <p data-testid="status-readonly">
                <span className="font-medium">{pipeline.status}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · only {data.owner_name ?? "the owner"} can change this
                </span>
              </p>
            ) : (
              <Select value={pipeline.status} onValueChange={handleStatusChange} disabled={isUpdatingStatus}>
                <SelectTrigger className="w-[200px]" data-testid="status-select">
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
            <p className="text-xs text-muted-foreground">
              Found {new Date(pipeline.found_at).toLocaleDateString()}
              {pipeline.status_changed_at &&
                ` · status changed ${new Date(pipeline.status_changed_at).toLocaleString()}`}
            </p>
            {statusError && (
              <p role="alert" className="text-destructive">
                {statusError}
              </p>
            )}
          </CardContent>
        </Card>

        <MatchCard matches={data.matches} />

        {data.experiences.length > 0 && (
          <Section title="Experience">
            <ol className="flex flex-col gap-4" data-testid="experience-list">
              {data.experiences.map((e) => (
                <li key={e.id} className="border-l-2 border-border pl-3">
                  <p className="font-medium text-foreground">
                    {e.title ?? "Role"}
                    {e.company && <span className="font-normal text-muted-foreground"> · {e.company}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[experiencePeriod(e), e.location, e.employment_type].filter(Boolean).join(" · ")}
                  </p>
                  {e.description && (
                    <p className="mt-1 whitespace-pre-line leading-relaxed text-muted-foreground">
                      {e.description}
                    </p>
                  )}
                  {e.skills.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Skills: {e.skills.join(", ")}</p>
                  )}
                </li>
              ))}
            </ol>
          </Section>
        )}

        {data.skills.length > 0 && (
          <Section title="Skills">
            <div className="flex flex-wrap gap-1.5" data-testid="skills-list">
              {data.skills.map((s) => (
                <Badge
                  key={s.name}
                  tone={s.is_top ? "good" : "neutral"}
                  className="font-normal"
                  title={s.is_top ? "Top skill" : undefined}
                >
                  {s.name}
                  {s.endorsements ? ` · ${s.endorsements}` : ""}
                </Badge>
              ))}
            </div>
          </Section>
        )}

        {data.education.length > 0 && (
          <Section title="Education">
            <ul className="flex flex-col gap-3">
              {data.education.map((ed) => (
                <li key={ed.id}>
                  <p className="font-medium text-foreground">{ed.school ?? "School"}</p>
                  <p className="text-muted-foreground">
                    {[ed.degree, ed.field_of_study].filter(Boolean).join(", ")}
                    {(ed.start_year || ed.end_year) &&
                      ` · ${[ed.start_year, ed.end_year].filter(Boolean).join(" – ")}`}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(data.certifications.length > 0 || data.languages.length > 0) && (
          <Section title="Certifications & Languages">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ul className="flex flex-col gap-2">
                {data.certifications.map((c) => (
                  <li key={c.id}>
                    <p className="font-medium text-foreground">
                      {c.credential_url ? (
                        <a href={c.credential_url} target="_blank" rel="noreferrer" className="underline">
                          {c.title}
                        </a>
                      ) : (
                        c.title
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[c.issuer, c.issued_on && `Issued ${c.issued_on}`, c.expires_on && `Expires ${c.expires_on}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
              <ul className="flex flex-col gap-1">
                {data.languages.map((l) => (
                  <li key={l.id}>
                    {l.name}
                    {l.proficiency && (
                      <span className="text-muted-foreground"> · {l.proficiency.replace(/_/g, " ")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Recruiter notes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {data.can_edit && (
              <div className="flex flex-col gap-2">
                <Textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add a note about this candidate for this job..."
                  data-testid="note-input"
                />
                <Button
                  type="button"
                  onClick={handleAddNote}
                  disabled={isSavingNote || !noteDraft.trim()}
                  data-testid="note-add-button"
                  className="self-start"
                >
                  {isSavingNote ? "Saving..." : "Add Note"}
                </Button>
                {noteError && (
                  <p role="alert" className="text-sm text-destructive">
                    {noteError}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3" data-testid="notes-list">
              {data.notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                data.notes.map((note) => (
                  <div key={note.id} className="rounded-md border p-3 text-sm" data-testid="note-item">
                    <p className="whitespace-pre-line">{note.note}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {note.author_name ? `${note.author_name} · ` : ""}
                      {new Date(note.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function CandidateProfileSkeleton() {
  return (
    <main className="min-h-screen">
      <DashboardNav />
      <p className="p-4 text-sm text-muted-foreground">Loading candidate...</p>
    </main>
  );
}

export default function CandidateProfilePage() {
  return (
    <Suspense fallback={<CandidateProfileSkeleton />}>
      <CandidateProfileContent />
    </Suspense>
  );
}
