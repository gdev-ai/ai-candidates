"use client";

import { Gauge, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  refreshCredits,
  setCredits,
  useCredits,
  type CreditsState,
} from "@/components/usage/useCredits";
import {
  formatResetsIn,
  formatUsd,
  limitFor,
  PERIOD_LABELS,
  QUOTA_BUFFER_SHARE,
  type ProviderQuota,
  type QuotaStatus,
  type SearchLimits,
  type UsageWindow,
} from "@/lib/usage/credits";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<ProviderQuota["role"], string> = {
  search: "Web search",
  enrich: "Profiles",
  ai: "AI scoring",
};

const STATUS_DOT: Record<QuotaStatus, string> = {
  ok: "bg-emerald-500",
  low: "bg-amber-500",
  out: "bg-red-500",
  unknown: "bg-slate-300",
};

function tone(left: number, limit: number): "ok" | "low" | "out" {
  if (left <= 0) return "out";
  return left / Math.max(1, limit) <= 0.2 ? "low" : "ok";
}

const TONE_TEXT = {
  ok: "text-foreground",
  low: "text-amber-600",
  out: "text-red-600",
};
const TONE_BAR = {
  ok: "bg-foreground",
  low: "bg-amber-500",
  out: "bg-red-500",
};

/** The window that runs out first: fewest searches left. */
function tightest(windows: UsageWindow[]): UsageWindow | null {
  return windows.reduce<UsageWindow | null>(
    (best, w) => (!best || w.left < best.left ? w : best),
    null,
  );
}

/** Ring that empties as searches are used. */
function Ring({
  fraction,
  toneName,
}: {
  fraction: number;
  toneName: keyof typeof TONE_TEXT;
}) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 18 18"
      className="h-[18px] w-[18px] -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        strokeWidth="2.5"
        className="stroke-border"
      />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, fraction)))}
        className={cn(
          "transition-[stroke-dashoffset] duration-700 ease-out",
          toneName === "ok"
            ? "stroke-foreground"
            : toneName === "low"
              ? "stroke-amber-500"
              : "stroke-red-500",
        )}
      />
    </svg>
  );
}

function WindowRow({ w }: { w: UsageWindow }) {
  const t = tone(w.left, w.limit);
  const pct = w.limit > 0 ? Math.min(100, (w.used / w.limit) * 100) : 100;
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-foreground">
          {PERIOD_LABELS[w.period]}
        </span>
        <span className="tabular-nums text-muted-foreground">
          <span className={cn("font-semibold", TONE_TEXT[t])}>{w.left}</span> of{" "}
          {w.limit} left
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${PERIOD_LABELS[w.period]}: ${w.used} of ${w.limit} searches used`}
        aria-valuemin={0}
        aria-valuemax={w.limit}
        aria-valuenow={w.used}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            TONE_BAR[t],
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>
          {w.used} used · {formatUsd(w.spendUsd)} spent
        </span>
        <span>Resets {formatResetsIn(w.resetsAt)}</span>
      </div>
    </li>
  );
}

function ProviderRow({ p }: { p: ProviderQuota }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          STATUS_DOT[p.status],
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-foreground">
            {p.label}{" "}
            <span className="font-normal text-muted-foreground">
              · {ROLE_LABELS[p.role]}
            </span>
          </span>
          <span className="shrink-0 tabular-nums text-foreground">
            {p.left}
          </span>
        </div>
        <div className="mt-0.5 flex justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{p.detail}</span>
          {p.searchesLeft !== null && (
            <span
              className={cn(
                "shrink-0 tabular-nums",
                p.status === "out"
                  ? "text-red-600"
                  : p.status === "low"
                    ? "text-amber-600"
                    : "",
              )}
            >
              ≈ {p.searchesLeft.toLocaleString("en-US")} searches
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function LimitsEditor({
  limits,
  onDone,
}: {
  limits: SearchLimits;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(limits);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/usage/limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await res.json().catch(() => null)) as
        (CreditsState & { error?: string }) | null;
      if (!res.ok || !data) {
        setError(data?.error ?? "Failed to save the limits.");
        return;
      }
      setCredits(data);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const fields: { key: keyof SearchLimits; label: string }[] = [
    { key: "daily", label: "Per day" },
    { key: "weekly", label: "Per week" },
    { key: "monthly", label: "Per month" },
  ];

  return (
    <div className="sp-fade-up border-t border-border pt-3">
      <div className="grid grid-cols-3 gap-2">
        {fields.map((f) => (
          <label
            key={f.key}
            htmlFor={`${ids}-${f.key}`}
            className="flex flex-col gap-1 text-[11px] text-muted-foreground"
          >
            {f.label}
            <input
              id={`${ids}-${f.key}`}
              type="number"
              min={0}
              inputMode="numeric"
              value={draft[f.key]}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  [f.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                })
              }
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDone}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save limits
        </Button>
      </div>
    </div>
  );
}

/**
 * Header counter of search credits left, shared by everyone on the same
 * API keys. Opens a panel with the daily / weekly / monthly windows and the
 * providers' own remaining quota.
 */
export function CreditsMeter() {
  const credits = useCredits();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    void refreshCredits();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setEditing(false);
  }, [open]);

  if (!credits) {
    return (
      <div
        className="h-8 w-28 animate-pulse rounded-full bg-muted"
        aria-hidden="true"
      />
    );
  }

  const day = credits.windows.find((w) => w.period === "day");
  const tight = tightest(credits.windows);
  const left = credits.searchesLeft;
  const pillTone = credits.blocked
    ? "out"
    : tight
      ? tone(left, limitFor(credits.limits, tight.period))
      : "ok";
  const fraction = tight && tight.limit > 0 ? left / tight.limit : 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        title="Search credits shared by your workspace"
        className={cn(
          "flex h-8 items-center gap-2 rounded-full border px-2.5 text-xs transition-colors",
          open
            ? "border-foreground bg-accent"
            : "border-border hover:bg-accent",
          pillTone === "out" &&
            "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
        )}
        data-testid="credits-meter"
      >
        <Ring fraction={fraction} toneName={pillTone} />
        <span className="tabular-nums">
          {credits.blocked ? (
            "Limit reached"
          ) : (
            <>
              <span className={cn("font-semibold", TONE_TEXT[pillTone])}>
                {left}
              </span>
              <span className="text-muted-foreground">
                {" "}
                {left === 1 ? "search" : "searches"} left
                {tight?.period === "day" ? " today" : ""}
              </span>
            </>
          )}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Search credits"
          className="sp-pop absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] origin-top-right rounded-xl border border-border bg-background p-4 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Gauge className="h-4 w-4" aria-hidden="true" />
                Search credits
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Shared by everyone using these API keys. A search or a
                scoring batch of up to 10 uses one.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2.5">
            {credits.blocked ? (
              <>
                <p className="text-sm font-semibold text-red-600">
                  {credits.blocked.reason}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {credits.blocked.resetsAt
                    ? `New searches open ${formatResetsIn(credits.blocked.resetsAt)}.`
                    : "Top up the provider to search again."}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {left}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    {left === 1 ? "search" : "searches"} left
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {day ? `${day.used} run today` : null}
                  {credits.avgCostPerSearchUsd !== null &&
                    ` · about ${formatUsd(credits.avgCostPerSearchUsd)} per search`}
                </p>
              </>
            )}
          </div>

          <ul className="mt-1 divide-y divide-border">
            {credits.windows.map((w) => (
              <WindowRow key={w.period} w={w} />
            ))}
          </ul>

          {credits.providers.length > 0 && (
            <>
              <h3 className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Provider quota
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Search counts keep a {Math.round(QUOTA_BUFFER_SHARE * 100)}%
                safety buffer unused.
              </p>
              <ul className="divide-y divide-border">
                {credits.providers.map((p) => (
                  <ProviderRow key={p.provider} p={p} />
                ))}
              </ul>
            </>
          )}

          {credits.canEditLimits &&
            (editing ? (
              <LimitsEditor
                limits={credits.limits}
                onDone={() => setEditing(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit limits
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
