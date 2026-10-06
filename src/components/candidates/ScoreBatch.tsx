"use client";

import { Check, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/components/ui/toast";
import { refreshCredits } from "@/components/usage/useCredits";
import type { RunProgress } from "@/lib/jobs/runProgress";
import { cn } from "@/lib/utils";

const POLL_MS = 2000;
const TERMINAL = new Set(["complete", "error", "cancelled"]);

export interface ActiveBatch {
  runId: string;
  personIds: string[];
  progress: RunProgress | null;
}

/**
 * A job's scoring batch: start one (next 10 unscored, or selected people),
 * follow its progress, and call `onScored` whenever more people get a
 * score so the table can refresh. Picks up a batch still running after a
 * reload.
 */
export function useScoreBatch(jobId: string, onScored: () => void) {
  const [batch, setBatch] = useState<ActiveBatch | null>(null);
  const [starting, setStarting] = useState(false);
  const onScoredRef = useRef(onScored);
  onScoredRef.current = onScored;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jobs/${jobId}/score`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data: { run?: { id: string; personIds: string[] } | null } | null) => {
          if (!cancelled && data?.run)
            setBatch({
              runId: data.run.id,
              personIds: data.run.personIds,
              progress: null,
            });
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const runId = batch?.runId;
  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    let lastScored = -1;
    async function tick() {
      try {
        const res = await fetch(`/api/search/${runId}/status`);
        if (res.ok) {
          const progress = (await res.json()) as RunProgress;
          if (stopped) return;
          setBatch((b) =>
            b && b.runId === runId
              ? {
                  ...b,
                  personIds: progress.target_person_ids ?? b.personIds,
                  progress,
                }
              : b,
          );
          if (progress.scored !== lastScored) {
            if (lastScored >= 0) onScoredRef.current();
            lastScored = progress.scored;
          }
          if (TERMINAL.has(progress.status)) {
            if (progress.status === "complete") {
              const n = progress.candidates_scored ?? progress.scored;
              toast.success(
                `Scored ${n} ${n === 1 ? "candidate" : "candidates"}.`,
                "Scoring Complete",
              );
            } else {
              toast.error(
                progress.error ?? "Scoring failed.",
                "Scoring Failed",
              );
            }
            onScoredRef.current();
            void refreshCredits();
            setTimeout(() => {
              if (!stopped) setBatch((b) => (b?.runId === runId ? null : b));
            }, 2500);
            return;
          }
        }
      } catch {
        // A dropped poll doesn't stop the batch; try again.
      }
      if (!stopped) setTimeout(tick, POLL_MS);
    }
    void tick();
    return () => {
      stopped = true;
    };
  }, [runId]);

  const start = useCallback(
    async (body: { personIds?: string[]; versionId?: string }) => {
      setStarting(true);
      try {
        const res = await fetch(`/api/jobs/${jobId}/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as {
          run?: { id: string };
          error?: string;
        };
        void refreshCredits();
        if (!res.ok || !data.run) {
          toast.error(data.error ?? "Couldn't start scoring.", "Scoring");
          return false;
        }
        // The batch's people come back with its first status poll; until
        // then, show the selection (if any) as being scored.
        setBatch({
          runId: data.run.id,
          personIds: body.personIds ?? [],
          progress: null,
        });
        return true;
      } catch {
        toast.error("Couldn't start scoring.", "Scoring");
        return false;
      } finally {
        setStarting(false);
      }
    },
    [jobId],
  );

  return { batch, starting, start };
}

/** Live progress of a scoring batch: reading profiles, then AI scoring. */
export function ScoreBatchBanner({ batch }: { batch: ActiveBatch }) {
  const p = batch.progress;
  const total = p?.target_count ?? (batch.personIds.length || null);
  const done = p?.status === "complete";
  const readTotal = p?.enrich_total ?? 0;
  const reading = p?.stage === "enriching" && readTotal > 0;
  const label = done
    ? "Scoring complete"
    : reading
      ? `Reading full profiles · ${Math.min(p?.enriched ?? 0, readTotal)} of ${readTotal}`
      : p?.stage === "scoring"
        ? `AI scoring · ${p.scored} of ${total ?? "…"}`
        : "Preparing…";
  // Reading is the first ~60% of the bar, scoring the rest.
  const fraction = done
    ? 1
    : !p || !total
      ? 0.04
      : reading
        ? 0.6 * Math.min(1, (p.enriched ?? 0) / readTotal)
        : p.stage === "scoring"
          ? 0.6 + 0.4 * Math.min(1, p.scored / total)
          : 0.04;

  return (
    <div
      className="sp-fade-up flex flex-col gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3"
      role="status"
      aria-live="polite"
      data-testid="score-batch-banner"
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium text-foreground">
          {done ? (
            <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          Scoring {total ?? ""} {total === 1 ? "candidate" : "candidates"}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            done ? "bg-emerald-500" : "bg-foreground",
          )}
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function ScoringBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <Sparkles className="h-3 w-3 animate-pulse" aria-hidden="true" />
      Scoring…
    </span>
  );
}
