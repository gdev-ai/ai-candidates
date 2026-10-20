"use client";

import { useEffect } from "react";

import { showToast } from "@/components/ui/toast";
import { playChime } from "@/lib/sound/chime";
import type { WatchedRun } from "@/app/api/search/watch/route";

const SEARCH_STARTED_EVENT = "sourcing:search-started";

/** Call right after starting a search or scoring batch, so the watcher
 * picks it up within seconds instead of on its next minute poll. */
export function notifySearchStarted(): void {
  window.dispatchEvent(new Event(SEARCH_STARTED_EVENT));
}

const FAST_MS = 10_000;
const SLOW_MS = 60_000;
const SINCE_KEY = "searchWatch.since";
const ANNOUNCED_KEY = "searchWatch.announced";

// Session storage keeps `since` across page navigations in this tab (the nav
// remounts on every page); local storage keeps one tab from announcing a run
// another tab already did. Both may be unavailable — then it still works,
// just without those two refinements.
function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // ignore
  }
}

function alreadyAnnounced(id: string): boolean {
  const seen = (read(() => localStorage, ANNOUNCED_KEY) ?? "").split(",");
  if (seen.includes(id)) return true;
  write(
    () => localStorage,
    ANNOUNCED_KEY,
    [id, ...seen].slice(0, 50).join(","),
  );
  return false;
}

function announce(run: WatchedRun): void {
  if (alreadyAnnounced(run.id)) return;
  const href = `/candidates?jobId=${run.jobId}&runId=${run.id}`;
  const scoring = run.kind === "score";

  if (run.status === "complete") {
    const scored = run.candidatesScored ?? 0;
    showToast({
      type: "success",
      title: scoring ? "Scoring finished" : "Search finished",
      message: scoring
        ? `${run.jobTitle}: ${scored} candidate${scored === 1 ? "" : "s"} scored.`
        : `${run.jobTitle}: ${run.candidatesFound} candidates found, ${scored} AI-scored.`,
      action: { label: "View results", href },
      duration: 0,
    });
    playChime("success");
  } else {
    showToast({
      type: "error",
      title: scoring ? "Scoring stopped" : "Search stopped",
      message: `${run.jobTitle}: it ended before finishing. Anyone it found so far is on the job.`,
      action: { label: "Open job", href },
      duration: 0,
    });
    playChime("error");
  }
}

/**
 * Watches the signed-in person's searches from any page: polls every 10 s
 * while one is running (every minute otherwise) and, when one ends, shows a
 * toast that stays until dismissed, plays a chime, and links to the results.
 */
export function SearchRunWatcher() {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(tick, ms);
    };

    async function tick() {
      let next = SLOW_MS;
      try {
        const since = read(() => sessionStorage, SINCE_KEY);
        const res = await fetch(
          `/api/search/watch${since ? `?since=${encodeURIComponent(since)}` : ""}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            now: string;
            running: WatchedRun[];
            finished: WatchedRun[];
          };
          write(() => sessionStorage, SINCE_KEY, data.now);
          if (!stopped) data.finished.forEach(announce);
          if (data.running.length > 0) next = FAST_MS;
        }
      } catch {
        // Offline or signed out: try again on the slow cadence.
      }
      schedule(next);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule(0);
    };
    // A search was just started on this page: start watching it promptly.
    const onStarted = () => schedule(2_000);

    void tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(SEARCH_STARTED_EVENT, onStarted);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(SEARCH_STARTED_EVENT, onStarted);
    };
  }, []);

  return null;
}
