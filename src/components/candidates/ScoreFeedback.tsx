"use client";

import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { COMMENT_MAX_LENGTH } from "@/lib/candidates/scoreFeedback";
import { cn } from "@/lib/utils";
import type {
  ScoreDirection,
  ScoreFeedback as Feedback,
  ScoreRating,
} from "@/types/candidate";

const DIRECTIONS: { value: ScoreDirection; label: string }[] = [
  { value: "too_high", label: "Too high" },
  { value: "too_low", label: "Too low" },
];

async function saveFeedback(
  matchId: string,
  feedback: Feedback | null,
): Promise<boolean> {
  try {
    const res = feedback
      ? await fetch("/api/score-feedback", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, ...feedback }),
        })
      : await fetch(`/api/score-feedback?matchId=${matchId}`, {
          method: "DELETE",
        });
    if (res.ok) return true;
    const body = await res.json().catch(() => ({}));
    toast.error(body.error ?? "Failed to save your rating.", "Rating Failed");
  } catch {
    toast.error("Failed to save your rating.", "Rating Failed");
  }
  return false;
}

interface ScoreFeedbackProps {
  /** The match_results row being rated. */
  matchId: string;
  initial: Feedback | null;
  /**
   * "inline" (candidate page header): "Is this score right?" and the
   * thumbs. "compact" (table cell): just small thumbs. Either way the
   * comment box floats under the thumbs, so nothing around it shifts.
   */
  variant?: "inline" | "compact";
  onChange?: (feedback: Feedback | null) => void;
}

/**
 * Thumbs up / down on one AI score. One click saves the rating; a small
 * panel then offers "too high / too low" (on a thumbs down) and an optional
 * comment. Clicking the active thumb again clears the rating.
 */
export function ScoreFeedback({
  matchId,
  initial,
  variant = "inline",
  onChange,
}: ScoreFeedbackProps) {
  const [feedback, setFeedback] = useState<Feedback | null>(initial);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial?.comment ?? "");
  const [justSaved, setJustSaved] = useState(false);

  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Follow server data (a list refresh, a re-score) unless mid-edit.
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (openRef.current) return;
    setFeedback(initial);
    setDraft(initial?.comment ?? "");
  }, [matchId, initial]);

  /** Optimistic write; rolls back if the server refuses. */
  async function commit(next: Feedback | null) {
    const previous = feedback;
    setFeedback(next);
    onChange?.(next);
    const ok = await saveFeedback(matchId, next);
    if (!ok) {
      setFeedback(previous);
      onChange?.(previous);
      return;
    }
    setJustSaved(true);
  }

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 1500);
    return () => clearTimeout(t);
  }, [justSaved]);

  function rate(rating: ScoreRating) {
    if (feedback?.rating === rating) {
      setOpen(false);
      setDraft("");
      void commit(null);
      return;
    }
    void commit({
      rating,
      direction: null,
      comment: draft.trim() || null,
    });
    setOpen(true);
  }

  function setDirection(direction: ScoreDirection) {
    if (!feedback) return;
    void commit({
      ...feedback,
      direction: feedback.direction === direction ? null : direction,
    });
  }

  /** Closes the panel, saving the comment if it changed. */
  function close() {
    setOpen(false);
    if (!feedback) return;
    const comment = draft.trim() || null;
    if (comment !== feedback.comment) void commit({ ...feedback, comment });
  }

  // The panel is fixed-positioned so a table's overflow can't clip it; it
  // closes on outside click, Escape, scroll or resize. In a table it opens
  // from the thumbs' left edge, in the page header from their right edge.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const width = 288;
    const left = variant === "compact" ? rect.left : rect.right - width;
    setPosition({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    });
  }, [open, variant]);

  useEffect(() => {
    if (open) textareaRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      )
        return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onScroll(e: Event) {
      if (panelRef.current?.contains(e.target as Node)) return;
      close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
    // close() reads the latest state each render; re-binding on every
    // change keeps it fresh.
  });

  const thumbs = (
    <div ref={anchorRef} className="flex items-center gap-0.5">
      <ThumbButton
        label="Score looks right"
        active={feedback?.rating === "up"}
        tone="good"
        onClick={() => rate("up")}
        size={variant}
      >
        <ThumbsUp />
      </ThumbButton>
      <ThumbButton
        label="Score looks wrong"
        active={feedback?.rating === "down"}
        tone="critical"
        onClick={() => rate("down")}
        size={variant}
      >
        <ThumbsDown />
      </ThumbButton>
      {feedback?.comment && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-1 max-w-[160px] truncate text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          title={feedback.comment}
        >
          {variant === "compact" ? "Comment" : `“${feedback.comment}”`}
        </button>
      )}
      {justSaved && (
        <span
          className="ml-1 inline-flex items-center gap-0.5 text-xs text-emerald-700"
          role="status"
        >
          <Check className="h-3 w-3" aria-hidden="true" />
          Saved
        </span>
      )}
    </div>
  );

  const panel = open && feedback && (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Rate this score"
      className={cn(
        "fixed z-50 flex w-72 flex-col gap-2 rounded-lg border border-border bg-background p-3 text-sm shadow-lg",
        !position && "invisible",
      )}
      style={position ?? undefined}
      data-testid="score-feedback-panel"
    >
      {feedback.rating === "down" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">The score is</span>
          {DIRECTIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDirection(d.value)}
              aria-pressed={feedback.direction === d.value}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                feedback.direction === d.value
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            close();
          }
        }}
        maxLength={COMMENT_MAX_LENGTH}
        rows={2}
        placeholder={
          feedback.rating === "down"
            ? "What did the AI miss? (optional)"
            : "Anything to add? (optional)"
        }
        className="w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        data-testid="score-feedback-comment"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Enter to save · Esc to close
        </span>
        <Button type="button" size="sm" onClick={close}>
          Done
        </Button>
      </div>
    </div>
  );

  if (variant === "compact") {
    return (
      <div data-testid="score-feedback">
        {thumbs}
        {panel}
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 text-sm"
      data-testid="score-feedback"
    >
      <span className="text-muted-foreground">Is this score right?</span>
      {thumbs}
      {panel}
    </div>
  );
}

function ThumbButton({
  label,
  active,
  tone,
  size,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  tone: "good" | "critical";
  size: "inline" | "compact";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={active ? `${label} · click to clear` : label}
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-colors [&_svg]:shrink-0",
        size === "compact"
          ? "h-6 w-6 [&_svg]:h-3.5 [&_svg]:w-3.5"
          : "h-8 w-8 [&_svg]:h-4 [&_svg]:w-4",
        active
          ? tone === "good"
            ? "bg-emerald-100 text-emerald-700 [&_svg]:fill-current"
            : "bg-red-100 text-red-700 [&_svg]:fill-current"
          : "text-muted-foreground/70 hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
