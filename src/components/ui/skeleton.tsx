import * as React from "react";

import { cn } from "@/lib/utils";

/** A pulsing placeholder block; size and shape come from className. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

/**
 * Wraps a group of skeletons so screen readers hear one "Loading …"
 * instead of nothing.
 */
export function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

// Varied bar widths so rows don't look like a ruled sheet.
const WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-2/5"];

/**
 * A table placeholder: a header strip and `rows` lines of `columns` bars.
 * `avatar` puts a circle and two lines in the first column, like a person
 * cell.
 */
export function TableSkeleton({
  rows = 6,
  columns = 5,
  avatar = false,
  label = "Loading…",
  className,
}: {
  rows?: number;
  columns?: number;
  avatar?: boolean;
  label?: string;
  className?: string;
}) {
  const grid = {
    gridTemplateColumns: `${avatar ? "minmax(0, 2fr)" : "minmax(0, 1.5fr)"} repeat(${columns - 1}, minmax(0, 1fr))`,
  };
  return (
    <LoadingRegion
      label={label}
      className={cn(
        "overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      <div
        className="grid gap-4 border-b border-border bg-muted/60 p-3"
        style={grid}
      >
        {Array.from({ length: columns }).map((_, c) => (
          <Skeleton key={c} className="h-3 w-16" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid items-center gap-4 border-b border-border/70 p-3 last:border-0"
          style={grid}
        >
          {avatar ? (
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className={cn("h-3.5", WIDTHS[r % WIDTHS.length])} />
                <Skeleton
                  className={cn("h-3", WIDTHS[(r + 2) % WIDTHS.length])}
                />
              </div>
            </div>
          ) : (
            <Skeleton className={cn("h-4", WIDTHS[r % WIDTHS.length])} />
          )}
          {Array.from({ length: columns - 1 }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn("h-4", WIDTHS[(r + c + 1) % WIDTHS.length])}
            />
          ))}
        </div>
      ))}
    </LoadingRegion>
  );
}

/** A card-shaped placeholder: a title bar and a few text lines. */
export function CardSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-6 shadow-soft",
        className,
      )}
    >
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === lines - 1 ? "w-1/2" : "w-full")}
        />
      ))}
    </div>
  );
}

/** A KPI tile placeholder. */
export function StatSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-6 shadow-soft",
        className,
      )}
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-16" />
    </div>
  );
}
