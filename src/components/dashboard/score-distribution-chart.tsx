import type { ScoreBucket } from "@/lib/dashboard/getDashboardData";

export function ScoreDistributionChart({ buckets }: { buckets: ScoreBucket[] }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No candidates scored yet. Run &ldquo;Score Candidates&rdquo; on a job to see the
        match-quality breakdown here.
      </p>
    );
  }

  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

  return (
    <div
      className="flex h-40 items-end gap-3"
      role="img"
      aria-label="Distribution of candidate match scores"
    >
      {buckets.map((bucket, index) => {
        const heightPct = bucket.count === 0 ? 0 : Math.max(6, (bucket.count / max) * 100);
        return (
          <div key={bucket.label} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-xs font-medium tabular-nums text-foreground">{bucket.count}</span>
            <div className="flex h-28 w-full items-end">
              <div
                className="animate-bar-y w-full bg-foreground"
                style={{ height: `${heightPct}%`, animationDelay: `${index * 60}ms` }}
                title={`${bucket.label}%: ${bucket.count} candidate${bucket.count === 1 ? "" : "s"}`}
              />
            </div>
            <span className="text-xs text-muted-foreground">{bucket.label}</span>
          </div>
        );
      })}
    </div>
  );
}
