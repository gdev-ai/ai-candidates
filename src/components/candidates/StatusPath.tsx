"use client";

import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CandidateStatus } from "@/lib/candidates/statuses";
import { cn } from "@/lib/utils";

/** The forward path. "Rejected" closes it instead of being a step. */
const PATH = [
  "New",
  "Reviewed",
  "Shortlisted",
  "Contacted",
  "Hired",
] as const satisfies readonly CandidateStatus[];

const NOTCH = "14px";
const CLIP = {
  first: `polygon(0 0, calc(100% - ${NOTCH}) 0, 100% 50%, calc(100% - ${NOTCH}) 100%, 0 100%)`,
  middle: `polygon(0 0, calc(100% - ${NOTCH}) 0, 100% 50%, calc(100% - ${NOTCH}) 100%, 0 100%, ${NOTCH} 50%)`,
  last: `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${NOTCH} 50%)`,
};

type StepState = "complete" | "current" | "won" | "lost" | "upcoming";

interface StatusPathProps {
  status: string;
  onChange: (status: CandidateStatus) => void;
  /** A save is in flight; the controls wait. */
  busy?: boolean;
  readOnly?: boolean;
}

/**
 * The candidate's pipeline as a chevron path (like a CRM lead path): done
 * stages are ticked, the current one is filled. Click a stage to pick it,
 * then "Mark as current stage"; or "Move to …" advances one step.
 */
export function StatusPath({
  status,
  onChange,
  busy = false,
  readOnly = false,
}: StatusPathProps) {
  const [selected, setSelected] = useState<CandidateStatus | null>(null);
  useEffect(() => setSelected(null), [status]);

  const rejected = status === "Rejected";
  const currentIndex = PATH.indexOf(status as (typeof PATH)[number]);
  const next =
    currentIndex >= 0 && currentIndex < PATH.length - 1
      ? PATH[currentIndex + 1]
      : null;

  function stateOf(index: number): StepState {
    if (rejected) return index === PATH.length - 1 ? "lost" : "upcoming";
    if (index < currentIndex) return "complete";
    if (index === currentIndex) return status === "Hired" ? "won" : "current";
    return "upcoming";
  }

  return (
    <div className="flex flex-col gap-3">
      <ol
        className="flex min-w-0 overflow-x-auto"
        aria-label="Pipeline stages"
        data-testid="status-path"
      >
        {PATH.map((stage, index) => {
          const state = stateOf(index);
          const label = state === "lost" ? "Rejected" : stage;
          const isSelected = selected === stage;
          const position =
            index === 0
              ? "first"
              : index === PATH.length - 1
                ? "last"
                : "middle";
          const interactive = !readOnly && !busy;

          return (
            <li
              key={stage}
              className={cn("min-w-[104px] flex-1", index > 0 && "-ml-2")}
            >
              <button
                type="button"
                disabled={!interactive}
                aria-current={
                  state === "current" || state === "won" || state === "lost"
                    ? "step"
                    : undefined
                }
                aria-pressed={interactive ? isSelected : undefined}
                aria-label={`${label}${state === "complete" ? " (done)" : ""}`}
                title={
                  interactive && !isSelected && label !== status
                    ? `Select ${label}`
                    : label
                }
                onClick={() =>
                  setSelected(isSelected || stage === status ? null : stage)
                }
                style={{ clipPath: CLIP[position] }}
                className={cn(
                  "group flex h-10 w-full items-center justify-center gap-1.5 px-6 text-sm font-medium transition-colors disabled:cursor-default",
                  position === "first" && "rounded-l-full pl-4",
                  position === "last" && "rounded-r-full pr-4",
                  isSelected
                    ? "bg-indigo-600 text-white"
                    : {
                        complete:
                          "bg-emerald-100 text-emerald-800 enabled:hover:bg-emerald-200",
                        current: "bg-primary text-primary-foreground",
                        won: "bg-emerald-600 text-white",
                        lost: "bg-red-600 text-white",
                        upcoming:
                          "bg-muted text-muted-foreground enabled:hover:bg-slate-200 enabled:hover:text-foreground",
                      }[state],
                )}
                data-testid="status-step"
              >
                {state === "complete" && !isSelected ? (
                  <>
                    <Check
                      className="h-4 w-4 group-enabled:group-hover:hidden"
                      aria-hidden="true"
                    />
                    <span className="hidden truncate group-enabled:group-hover:inline">
                      {label}
                    </span>
                  </>
                ) : (
                  <>
                    {state === "won" && (
                      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    {state === "lost" && (
                      <X className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{label}</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {selected ? (
            <Button
              type="button"
              className="rounded-full"
              disabled={busy}
              onClick={() => onChange(selected)}
              data-testid="status-path-apply"
            >
              {busy ? (
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              Mark as current stage
            </Button>
          ) : next ? (
            <Button
              type="button"
              className="rounded-full"
              disabled={busy}
              onClick={() => onChange(next)}
              data-testid="status-path-advance"
            >
              {busy ? (
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              Move to {next}
            </Button>
          ) : rejected ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={busy}
              onClick={() => onChange("New")}
              data-testid="status-path-reopen"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Reopen
            </Button>
          ) : null}
          {!rejected && (
            <Button
              type="button"
              variant="ghost"
              className="rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-700"
              disabled={busy}
              onClick={() => onChange("Rejected")}
              data-testid="status-path-reject"
            >
              <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Reject
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
