const STAGE_ORDER = [
  "New",
  "Reviewed",
  "Shortlisted",
  "Contacted",
  "Hired",
  "Rejected",
] as const;

// One distinct hue per stage so the bars read at a glance. Hired and Rejected
// keep the green/red status accents used by badges elsewhere.
export const STAGE_COLOR: Record<(typeof STAGE_ORDER)[number], string> = {
  New: "#94A3B8",
  Reviewed: "#0EA5E9",
  Shortlisted: "#8B5CF6",
  Contacted: "#F59E0B",
  Hired: "#10B981",
  Rejected: "#EF4444",
};

export function PipelineChart({ counts }: { counts: Record<string, number> }) {
  const total = STAGE_ORDER.reduce(
    (sum, stage) => sum + (counts[stage] ?? 0),
    0,
  );
  const max = Math.max(1, ...STAGE_ORDER.map((stage) => counts[stage] ?? 0));

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No candidates yet. Run a search to start building your pipeline.
      </p>
    );
  }

  return (
    <div
      className="flex flex-col gap-3"
      role="img"
      aria-label="Candidate pipeline by stage"
    >
      {STAGE_ORDER.map((stage, index) => {
        const count = counts[stage] ?? 0;
        const widthPct = Math.max(4, (count / max) * 100);
        return (
          <div key={stage} className="flex items-center gap-3">
            <span className="flex w-28 shrink-0 items-center gap-2 text-sm text-muted-foreground">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: STAGE_COLOR[stage] }}
              />
              {stage}
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded-sm bg-muted">
              {count > 0 && (
                <div
                  className="animate-bar-x h-full"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: STAGE_COLOR[stage],
                    animationDelay: `${index * 60}ms`,
                  }}
                  title={`${stage}: ${count}`}
                />
              )}
            </div>
            <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
