"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Check, Clock, Lightbulb, Minimize2 } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { matchScoreTone } from "@/components/ui/badge";
import type { LiveCandidate, RunProgress } from "@/lib/jobs/runProgress";
import { cn } from "@/lib/utils";

/**
 * Full-screen loading experience for a sourcing run: an estimate up top, a
 * per-stage illustration and rotating messages, a live stepper with counts,
 * and result cards that fill in as candidates are scored. Ends on a
 * summary. Runs take minutes (enrichment is the slow part), so this is
 * where the wait is made to feel alive and honest.
 */

export type SearchPhase = "preparing" | "running" | "complete";

interface StepDef {
  title: string;
  /** Progress bar span for this step, in percent. */
  range: [number, number];
}

export const SEARCH_STEPS: StepDef[] = [
  { title: "Plan the search", range: [0, 6] },
  { title: "Search LinkedIn", range: [6, 26] },
  { title: "Confirm location", range: [26, 34] },
  { title: "Shortlist", range: [34, 40] },
  { title: "Read full profiles", range: [40, 72] },
  { title: "AI scoring", range: [72, 97] },
];

/** Index into SEARCH_STEPS; SEARCH_STEPS.length once complete. */
export function currentStepIndex(
  phase: SearchPhase,
  progress: RunProgress | null,
): number {
  if (phase === "preparing") return 0;
  if (phase === "complete") return SEARCH_STEPS.length;
  switch (progress?.stage) {
    case "locating":
      return 2;
    case "shortlisting":
      return 3;
    case "enriching":
      return 4;
    case "scoring":
    case "finalizing":
      return 5;
    default:
      return 1;
  }
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Live detail under each stepper row. */
function stepDetail(
  index: number,
  p: RunProgress | null,
  location: string,
): string | null {
  if (!p) return index === 0 ? "Turning the job into search queries" : null;
  switch (index) {
    case 0:
      return plural(p.queries, "search query", "search queries");
    case 1:
      return p.profiles_scanned
        ? `${plural(p.profiles_scanned, "result")} scanned`
        : null;
    case 2:
      return p.in_country ? `${p.in_country} based in ${location}` : null;
    case 3:
      return p.shortlist_size !== null
        ? `Top ${p.shortlist_size} picked to score`
        : null;
    case 4:
      return p.enrich_total
        ? `${Math.min(p.enriched, p.enrich_total)} of ${p.enrich_total} read`
        : p.enrich_total === 0
          ? "Already up to date"
          : null;
    case 5:
      return p.shortlist_size
        ? `${Math.min(p.scored, p.shortlist_size)} of ${p.shortlist_size} scored`
        : null;
    default:
      return null;
  }
}

/** Messages for the current step; they rotate while it runs. */
function stepMessages(
  index: number,
  p: RunProgress | null,
  location: string,
): string[] {
  switch (index) {
    case 0:
      return [
        "Reading the job to work out who to look for",
        "Writing search queries: titles, similar roles and key skills",
      ];
    case 1:
      return p?.stage === "expanding"
        ? [
            `Too few people in ${location} so far: widening the search`,
            "Trying a few more title variations",
          ]
        : [
            `Searching public LinkedIn profiles in ${location}`,
            "Looking beyond exact titles: similar roles count too",
            p?.profiles_scanned
              ? `${plural(p.profiles_scanned, "profile")} turned up so far`
              : "Sending the queries out",
          ];
    case 2:
      return [
        `Checking who is actually based in ${location}`,
        "Leaving out people abroad and anyone at our own companies",
      ];
    case 3:
      return [
        p?.in_country
          ? `Quick-ranking ${p.in_country} people against the job`
          : "Quick-ranking everyone against the job",
        p?.max_candidates
          ? `Picking the ${p.max_candidates} most promising to read in full`
          : "Picking the most promising to read in full",
      ];
    case 4:
      return [
        "Reading full profiles: experience, education and skills",
        "This is the slow part, usually about a minute",
        p?.enrich_total
          ? `${Math.min(p.enriched, p.enrich_total)} of ${p.enrich_total} profiles read`
          : "Fetching the profiles",
      ];
    case 5:
      return p?.stage === "finalizing"
        ? ["Final checks before the list is ready", "Almost there"]
        : [
            "Scoring each candidate on their own, never against each other",
            "Weighing skills, relevant experience, seniority, location and education",
            p?.shortlist_size
              ? `${Math.min(p.scored, p.shortlist_size)} of ${p.shortlist_size} scored`
              : "Scoring candidates",
          ];
    default:
      return [];
  }
}

function tipsFor(location: string): string[] {
  return [
    "Each candidate is scored against the job on their own. Scores never depend on who else was found.",
    "People found but not AI-scored stay on the job too, listed below the scored ones.",
    `Anyone outside ${location} or currently at our companies is left out automatically.`,
    "You can hide this screen. The search keeps running and results land in the job's candidates.",
  ];
}

/** Cycles through `count` items every `ms`, restarting when `resetKey` changes. */
function useRotation(count: number, ms: number, resetKey: unknown): number {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    if (count <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), ms);
    return () => clearInterval(id);
  }, [count, ms, resetKey]);
  return Math.min(index, Math.max(0, count - 1));
}

const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

function Sparkle({
  x,
  y,
  size,
  d,
}: {
  x: number;
  y: number;
  size: number;
  d: number;
}) {
  const h = size / 2;
  return (
    <path
      className="sp-anim sp-twinkle fill-slate-900"
      style={delay(d)}
      d={`M${x} ${y - h} Q${x} ${y} ${x + h} ${y} Q${x} ${y} ${x} ${y + h} Q${x} ${y} ${x - h} ${y} Q${x} ${y} ${x} ${y - h}Z`}
    />
  );
}

/** One illustration per step (and one for done). Decorative. */
function StageIllustration({ step }: { step: number }) {
  const gradientId = useId();
  const common = "h-36 w-36 sm:h-40 sm:w-40";

  if (step === 0) {
    return (
      <svg viewBox="0 0 160 160" className={common} aria-hidden="true">
        <rect
          x="36"
          y="22"
          width="88"
          height="116"
          rx="10"
          className="fill-white stroke-slate-300"
          strokeWidth="2"
        />
        {[44, 58, 72, 86, 100].map((y, i) => (
          <rect
            key={y}
            x="50"
            y={y}
            width={[60, 44, 54, 36, 48][i]}
            height="6"
            rx="3"
            className="sp-type fill-slate-300"
            style={delay(i * 0.35)}
          />
        ))}
        <rect
          x="50"
          y="116"
          width="26"
          height="8"
          rx="4"
          className="fill-slate-900"
        />
        <Sparkle x={128} y={34} size={16} d={0} />
        <Sparkle x={30} y={66} size={11} d={0.7} />
        <Sparkle x={132} y={108} size={9} d={1.2} />
      </svg>
    );
  }

  if (step === 1) {
    const blips: [number, number, number][] = [
      [104, 48, 0.2],
      [118, 92, 0.9],
      [60, 112, 1.5],
      [48, 58, 2.0],
      [92, 122, 1.2],
    ];
    return (
      <svg
        viewBox="0 0 160 160"
        className={cn(common, "text-slate-900")}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.28" />
          </linearGradient>
        </defs>
        <circle
          cx="80"
          cy="80"
          r="64"
          className="fill-slate-50 stroke-slate-200"
          strokeWidth="2"
        />
        <circle
          cx="80"
          cy="80"
          r="44"
          className="fill-none stroke-slate-200"
          strokeWidth="2"
        />
        <circle
          cx="80"
          cy="80"
          r="22"
          className="fill-none stroke-slate-200"
          strokeWidth="2"
        />
        <path
          d="M16 80h128M80 16v128"
          className="stroke-slate-200"
          strokeWidth="1.5"
        />
        <g className="sp-sweep">
          <path
            d="M80 80 L80 16 A64 64 0 0 1 135.4 48 Z"
            fill={`url(#${gradientId})`}
          />
          <path
            d="M80 80 L135.4 48"
            className="stroke-slate-900"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
        {blips.map(([x, y, d]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r="5"
            className="sp-anim sp-blip fill-slate-900"
            style={delay(d)}
          />
        ))}
        <circle cx="80" cy="80" r="5" className="fill-slate-900" />
      </svg>
    );
  }

  if (step === 2) {
    return (
      <svg viewBox="0 0 160 160" className={common} aria-hidden="true">
        <rect
          x="18"
          y="34"
          width="124"
          height="96"
          rx="14"
          className="fill-slate-50 stroke-slate-200"
          strokeWidth="2"
        />
        <path
          d="M18 70h124M18 100h124M56 34v96M104 34v96"
          className="stroke-slate-200"
          strokeWidth="1.5"
          strokeDasharray="4 5"
        />
        {/* People elsewhere: crossed out. */}
        {(
          [
            [36, 50],
            [126, 116],
          ] as const
        ).map(([x, y]) => (
          <g
            key={`${x}-${y}`}
            className="stroke-slate-300"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx={x} cy={y} r="6" className="fill-white" />
            <path d={`M${x - 3} ${y - 3}l6 6M${x + 3} ${y - 3}l-6 6`} />
          </g>
        ))}
        <ellipse
          cx="80"
          cy="110"
          rx="18"
          ry="6"
          className="sp-anim sp-ring fill-slate-900/20"
        />
        <ellipse cx="80" cy="110" rx="9" ry="3" className="fill-slate-900/25" />
        <g className="sp-bounce">
          <path
            d="M80 40c-14.4 0-26 11.6-26 26 0 19 26 42 26 42s26-23 26-42c0-14.4-11.6-26-26-26z"
            className="fill-slate-900"
          />
          <circle cx="80" cy="66" r="9" className="fill-white" />
        </g>
      </svg>
    );
  }

  if (step === 3) {
    const drops: [number, number][] = [
      [52, 0],
      [72, 0.6],
      [94, 1.2],
      [110, 0.3],
      [64, 1.8],
      [86, 0.9],
    ];
    return (
      <svg viewBox="0 0 160 160" className={common} aria-hidden="true">
        {drops.map(([x, d]) => (
          <circle
            key={`${x}-${d}`}
            cx={x}
            cy="24"
            r="5"
            className="sp-anim sp-fall fill-slate-400"
            style={delay(d)}
          />
        ))}
        <path
          d="M26 50h108l-38 44v26l-32 12V94z"
          className="fill-white stroke-slate-900"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M40 62h80"
          className="stroke-slate-200"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <g className="sp-float">
          <circle cx="80" cy="144" r="8" className="fill-emerald-500" />
          <path
            d="M76 144l3 3 5-6"
            className="fill-none stroke-white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    );
  }

  if (step === 4) {
    return (
      <svg viewBox="0 0 160 160" className={common} aria-hidden="true">
        <rect
          x="40"
          y="36"
          width="96"
          height="104"
          rx="12"
          className="fill-slate-100"
        />
        <rect
          x="28"
          y="26"
          width="96"
          height="104"
          rx="12"
          className="fill-white stroke-slate-300"
          strokeWidth="2"
        />
        <circle cx="52" cy="52" r="12" className="fill-slate-200" />
        <circle cx="52" cy="48" r="4.5" className="fill-slate-400" />
        <path d="M44 59a8 8 0 0 1 16 0" className="fill-slate-400" />
        {(
          [
            [70, 46, 42],
            [70, 56, 28],
            [40, 78, 72],
            [40, 90, 60],
            [40, 102, 68],
            [40, 114, 44],
          ] as const
        ).map(([x, y, w], i) => (
          <rect
            key={y}
            x={x}
            y={y}
            width={w}
            height="6"
            rx="3"
            className="sp-type fill-slate-300"
            style={delay(i * 0.25)}
          />
        ))}
        <g className="sp-scan">
          <circle
            cx="84"
            cy="70"
            r="15"
            className="fill-white/40 stroke-slate-900"
            strokeWidth="4"
          />
          <path
            d="M95 81l13 13"
            className="stroke-slate-900"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </g>
      </svg>
    );
  }

  if (step === 5) {
    return (
      <svg viewBox="0 0 160 160" className={common} aria-hidden="true">
        <path
          d="M30 104a50 50 0 0 1 100 0"
          className="fill-none stroke-slate-200"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M30 104a50 50 0 0 1 100 0"
          className="sp-gauge fill-none stroke-emerald-500"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <line
          x1="80"
          y1="104"
          x2="80"
          y2="66"
          className="sp-needle stroke-slate-900"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="80" cy="104" r="7" className="fill-slate-900" />
        <rect
          x="56"
          y="122"
          width="48"
          height="14"
          rx="7"
          className="fill-slate-100"
        />
        <Sparkle x={34} y={50} size={16} d={0} />
        <Sparkle x={128} y={44} size={12} d={0.6} />
        <Sparkle x={124} y={80} size={9} d={1.1} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 160 160" className={common} aria-hidden="true">
      <circle
        cx="80"
        cy="80"
        r="40"
        className="sp-anim sp-ring fill-emerald-500/25"
      />
      <circle cx="80" cy="80" r="44" className="fill-emerald-100" />
      <circle cx="80" cy="80" r="32" className="fill-emerald-500" />
      <path
        d="M64 81l11 11 21-23"
        className="sp-draw fill-none stroke-white"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Sparkle x={30} y={40} size={14} d={0} />
      <Sparkle x={130} y={46} size={12} d={0.5} />
      <Sparkle x={126} y={124} size={10} d={1} />
    </svg>
  );
}

const SCORE_TONE_CLASSES = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  critical: "bg-red-50 text-red-700 ring-red-200",
  neutral: "bg-slate-50 text-slate-600 ring-slate-200",
} as const;

function LiveCandidateCard({ candidate }: { candidate: LiveCandidate }) {
  return (
    <li className="sp-pop flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <Avatar
        src={candidate.photoUrl}
        alt={candidate.name ?? "Candidate"}
        className="h-9 w-9"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">
          {candidate.name ?? "Unnamed candidate"}
        </p>
        {candidate.headline && (
          <p className="truncate text-xs text-slate-500">
            {candidate.headline}
          </p>
        )}
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ring-1",
          SCORE_TONE_CLASSES[matchScoreTone(candidate.score)],
        )}
      >
        {candidate.score}%
      </span>
    </li>
  );
}

function SkeletonCard({ index }: { index: number }) {
  return (
    <li
      className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3"
      aria-hidden="true"
    >
      <span className="h-9 w-9 shrink-0 rounded-full bg-slate-200/80" />
      <span className="flex-1 space-y-2">
        <span
          className="block h-2.5 rounded-full bg-slate-200/80"
          style={{ width: `${55 + ((index * 17) % 30)}%` }}
        />
        <span
          className="block h-2 rounded-full bg-slate-200/60"
          style={{ width: `${70 + ((index * 11) % 25)}%` }}
        />
      </span>
      <span className="h-5 w-10 shrink-0 rounded-full bg-slate-200/80" />
      <span
        className="sp-shimmer absolute inset-0"
        style={delay((index % 4) * 0.2)}
      />
    </li>
  );
}

export interface SearchProgressProps {
  phase: SearchPhase;
  progress: RunProgress | null;
  /** Estimated run length, whole minutes. */
  estimateMinutes: number;
  /** When the user started the search (ms since epoch, client clock). */
  startedAt: number;
  /** Candidates the user asked for; slots shown before the run reports it. */
  candidateLimit: number;
  jobTitle: string;
  /** Where people are searched for, e.g. "Cairo" or "Egypt". */
  location: string;
  /** Running: hide and keep the search going. Complete: close. */
  onHide: () => void;
  onViewCandidates: () => void;
}

/** Most result slots shown while running; larger runs show a "+N" note. */
const MAX_SLOTS = 10;

export function SearchProgress({
  phase,
  progress,
  estimateMinutes,
  startedAt,
  candidateLimit,
  jobTitle,
  location,
  onHide,
  onViewCandidates,
}: SearchProgressProps) {
  const step = currentStepIndex(phase, progress);
  const done = phase === "complete";

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [done]);
  const elapsed = Math.max(0, (now - startedAt) / 1000);

  // Escape hides a running search (it keeps going) or closes the summary.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onHide();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onHide]);

  // Progress: the step's span, filled by its live counts or by time against
  // the estimate (whichever is further), and never moving backwards.
  const peak = useRef(0);
  let percent = 100;
  if (!done) {
    const def = SEARCH_STEPS[step] ?? SEARCH_STEPS[SEARCH_STEPS.length - 1];
    const [floor, ceil] = def ? def.range : [0, 97];
    let within = 0;
    if (step === 4 && progress?.enrich_total)
      within = progress.enriched / progress.enrich_total;
    if (step === 5 && progress?.shortlist_size)
      within = progress.scored / progress.shortlist_size;
    const byCount = floor + (ceil - floor) * Math.min(1, within);
    const byTime = Math.min((elapsed / (estimateMinutes * 60)) * 100, ceil - 1);
    percent = Math.max(floor, byCount, byTime);
  }
  peak.current = done ? 100 : Math.max(peak.current, percent);
  const shownPercent = Math.round(peak.current);

  const remaining = estimateMinutes * 60 - elapsed;
  const timeLeft =
    remaining > 60
      ? `About ${Math.ceil(remaining / 60)} min left`
      : remaining > 10
        ? "Less than a minute left"
        : "Taking a little longer than usual";

  const messages = stepMessages(step, progress, location);
  const messageIndex = useRotation(messages.length, 4200, step);
  const tips = tipsFor(location);
  const tipIndex = useRotation(tips.length, 9000, null);

  const target = progress?.max_candidates ?? candidateLimit;
  const slots = Math.min(target, MAX_SLOTS);
  const top = progress?.top ?? [];
  const shown = top.slice(0, slots);
  const found = progress?.candidates_found ?? 0;
  const scoredTotal = progress?.candidates_scored ?? top.length;
  const unscored = Math.max(0, found - scoredTotal);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-progress-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm"
      data-testid="search-progress-screen"
    >
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div className="sp-pop w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
          {/* Estimate disclaimer */}
          {!done && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs text-slate-600 sm:px-6">
              <Clock
                className="h-3.5 w-3.5 shrink-0 text-slate-500"
                aria-hidden="true"
              />
              <span>
                Candidate searches take about{" "}
                <strong className="font-semibold text-slate-900">
                  {plural(estimateMinutes, "minute")}
                </strong>
                . You can hide this screen; the search keeps running.
              </span>
            </div>
          )}

          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {done ? "Search complete" : "Finding candidates"}
              </p>
              <h2
                id="search-progress-title"
                className="mt-1 truncate text-xl font-bold text-slate-900"
              >
                {jobTitle || "This role"}
              </h2>
            </div>
            {!done && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onHide}
                className="shrink-0 gap-1.5"
              >
                <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Run in background</span>
                <span className="sm:hidden">Hide</span>
              </Button>
            )}
          </div>

          {/* Progress bar */}
          <div className="px-5 pt-4 sm:px-6">
            <div
              className="relative h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="Search progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={shownPercent}
            >
              <div
                className={cn(
                  "relative h-full overflow-hidden rounded-full transition-[width] duration-700 ease-out",
                  done ? "bg-emerald-500" : "bg-slate-900",
                )}
                style={{ width: `${Math.max(3, shownPercent)}%` }}
              >
                {!done && (
                  <span className="sp-shimmer absolute inset-0 opacity-60" />
                )}
              </div>
            </div>
            <div className="mt-2 flex justify-between text-xs tabular-nums text-slate-500">
              <span>
                {done
                  ? "Done"
                  : `${shownPercent}% · ${formatElapsed(elapsed)} elapsed`}
              </span>
              {!done && <span>{timeLeft}</span>}
            </div>
          </div>

          {/* Stage + stepper */}
          <div className="grid gap-6 px-5 py-6 sm:px-6 md:grid-cols-[1fr_260px]">
            <div className="flex flex-col items-center text-center md:flex-row md:items-center md:gap-6 md:text-left">
              <div key={step} className="sp-fade-up shrink-0">
                <StageIllustration step={step} />
              </div>
              <div className="min-w-0 flex-1" aria-live="polite">
                {done ? (
                  <>
                    <p className="sp-fade-up text-2xl font-bold text-slate-900">
                      {plural(found, "candidate")} found
                    </p>
                    <p
                      className="sp-fade-up mt-2 text-sm leading-relaxed text-slate-600"
                      style={delay(0.1)}
                    >
                      <strong className="text-slate-900">
                        {scoredTotal} AI-scored
                      </strong>{" "}
                      and ranked
                      {unscored > 0 && (
                        <>
                          , plus{" "}
                          <strong className="text-slate-900">
                            {unscored} more
                          </strong>{" "}
                          kept on the job unscored
                        </>
                      )}
                      .
                      {progress?.candidates_new
                        ? ` ${progress.candidates_new} are new to the database.`
                        : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold text-slate-900">
                      {SEARCH_STEPS[step]?.title}
                    </p>
                    <p
                      key={`${step}-${messageIndex}`}
                      className="sp-fade-up mt-1.5 min-h-10 text-sm text-slate-600"
                    >
                      {messages[messageIndex]}
                    </p>
                    <p
                      key={`tip-${tipIndex}`}
                      className="sp-fade-up mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-left text-xs leading-relaxed text-slate-500"
                    >
                      <Lightbulb
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
                        aria-hidden="true"
                      />
                      {tips[tipIndex]}
                    </p>
                  </>
                )}
              </div>
            </div>

            <ol className="space-y-1" aria-label="Search steps">
              {SEARCH_STEPS.map((s, i) => {
                const state =
                  i < step ? "done" : i === step ? "active" : "todo";
                const detail =
                  state === "todo" ? null : stepDetail(i, progress, location);
                return (
                  <li
                    key={s.title}
                    className={cn(
                      "flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors duration-300",
                      state === "active" && "bg-slate-100",
                    )}
                    aria-current={state === "active" ? "step" : undefined}
                  >
                    <span
                      className={cn(
                        "relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors duration-300",
                        state === "done" && "bg-emerald-500 text-white",
                        state === "active" && "bg-slate-900 text-white",
                        state === "todo" &&
                          "bg-slate-100 text-slate-400 ring-1 ring-slate-200",
                      )}
                    >
                      {state === "done" ? (
                        <Check className="sp-pop h-3 w-3" strokeWidth={3} />
                      ) : (
                        i + 1
                      )}
                      {state === "active" && (
                        <span
                          className="sp-anim sp-ring absolute inset-0 rounded-full bg-slate-900/40"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block text-sm font-medium",
                          state === "todo"
                            ? "text-slate-400"
                            : "text-slate-900",
                        )}
                      >
                        {s.title}
                      </span>
                      {detail && (
                        <span
                          key={detail}
                          className="sp-fade-up block text-xs tabular-nums text-slate-500"
                        >
                          {detail}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Live results */}
          <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-5 sm:px-6">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {done ? "Top matches" : "Live results"}
              </h3>
              <span className="text-xs text-slate-500">
                {done
                  ? top.length
                    ? `Best ${Math.min(3, top.length)} of ${scoredTotal} scored`
                    : "No one was scored"
                  : top.length
                    ? `${top.length} of ${target} scored so far`
                    : "Candidates appear here as they're scored"}
              </span>
            </div>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {(done ? top.slice(0, 3) : shown).map((c) => (
                <LiveCandidateCard key={c.personId} candidate={c} />
              ))}
              {!done &&
                Array.from(
                  { length: Math.max(0, slots - shown.length) },
                  (_, i) => (
                    <SkeletonCard
                      key={`skeleton-${i}`}
                      index={i + shown.length}
                    />
                  ),
                )}
            </ul>
            {!done && target > MAX_SLOTS && (
              <p className="mt-3 text-center text-xs text-slate-500">
                Showing the best {MAX_SLOTS}; all {target} will be on the job.
              </p>
            )}

            {done && (
              <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={onHide}>
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={onViewCandidates}
                  data-testid="view-candidates-button"
                >
                  View all candidates
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
