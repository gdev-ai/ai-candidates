import * as React from "react";

import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  neutral: "border-transparent bg-muted text-muted-foreground",
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-red-200 bg-red-50 text-red-700",
} as const;

export type BadgeTone = keyof typeof TONE_CLASSES;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}

export function runStatusTone(status: string): BadgeTone {
  if (status === "complete") return "good";
  if (status === "running" || status === "pending") return "warning";
  if (status === "error") return "critical";
  return "neutral";
}

/** Buckets a 0–100 match score into the tone a CEO would expect at a glance:
 * strong (green), workable (amber), weak (red). No score yet = neutral gray. */
export function matchScoreTone(score: number | null | undefined): BadgeTone {
  if (score === null || score === undefined) return "neutral";
  if (score >= 70) return "good";
  if (score >= 40) return "warning";
  return "critical";
}
