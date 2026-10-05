"use client";

import { Briefcase, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DashboardNav } from "@/components/dashboard/nav";
import { Button } from "@/components/ui/button";
import { EmptyCell } from "@/components/ui/empty-cell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SENIORITY_LABELS, type JobListItem, type Seniority } from "@/types/job";

const PAGE_SIZE = 10;

function seniorityLabel(value: string | null): string | null {
  return value ? (SENIORITY_LABELS[value as Seniority] ?? value) : null;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetch(`/api/jobs?page=${page}&limit=${PAGE_SIZE}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to load jobs.");
          return;
        }
        setJobs(data.jobs ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to load jobs.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="min-h-screen">
      <DashboardNav />
      <div className="animate-page-enter mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
              Jobs
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every role you&apos;re sourcing for, in one place.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/jobs/new">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              New Job
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">All Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading jobs...</p>
            ) : error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Briefcase className="h-6 w-6" aria-hidden="true" />
                </span>
                <p className="text-sm text-muted-foreground">
                  No jobs yet.{" "}
                  <Link href="/jobs/new" className="font-medium text-primary underline">
                    Create your first job
                  </Link>{" "}
                  to start finding candidates.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[700px] text-sm" data-testid="jobs-table">
                    <thead>
                      <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="p-3 font-medium">Title</th>
                        <th className="p-3 font-medium">Company</th>
                        <th className="p-3 font-medium">City</th>
                        <th className="p-3 font-medium">Employment Type</th>
                        <th className="p-3 font-medium">Seniority</th>
                        <th className="p-3 font-medium">Created</th>
                        <th className="p-3 font-medium">Candidates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job) => (
                        <tr
                          key={job.id}
                          className="border-b border-border/70 last:border-0 hover:bg-accent/40"
                          data-testid="job-row"
                        >
                          <td className="p-3 font-medium text-foreground">{job.title}</td>
                          <td className="p-3 text-muted-foreground">
                            {job.company_name || <EmptyCell />}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {job.city || "Egypt"}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {job.employment_type || <EmptyCell />}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {seniorityLabel(job.seniority) || <EmptyCell />}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(job.created_at).toLocaleDateString()}
                          </td>
                          <td className="p-3">
                            <Link
                              href={`/candidates?jobId=${job.id}`}
                              className="font-medium text-primary underline underline-offset-2"
                            >
                              View {job.candidate_count} candidate{job.candidate_count === 1 ? "" : "s"}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground" data-testid="pagination-summary">
                    Page {page} of {totalPages} ({total} total)
                  </p>
                  <div className="flex gap-2">
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
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
