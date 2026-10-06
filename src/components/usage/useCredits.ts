"use client";

import { useEffect, useSyncExternalStore } from "react";

import type { CreditsSnapshot } from "@/lib/usage/credits";

export type CreditsState = CreditsSnapshot & { canEditLimits: boolean };

/** Shared counters change when anyone searches, so re-read regularly. */
const REFRESH_MS = 60_000;

let state: CreditsState | null = null;
let inflight: Promise<void> | null = null;
let lastLoad = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setCredits(next: CreditsState) {
  state = next;
  lastLoad = Date.now();
  emit();
}

/** Re-reads the shared credits (deduped across every component using them). */
export function refreshCredits(): Promise<void> {
  inflight ??= fetch("/api/usage", { cache: "no-store" })
    .then((res) => (res.ok ? (res.json() as Promise<CreditsState>) : null))
    .then((data) => {
      if (data) setCredits(data);
    })
    .catch(() => {
      // Keep the last known numbers.
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The tenant's search credits, shared by every user on the same API keys.
 * Polls every minute while visible and on refocus.
 */
export function useCredits(): CreditsState | null {
  const credits = useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  );

  useEffect(() => {
    if (Date.now() - lastLoad > 5_000) void refreshCredits();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshCredits();
    }, REFRESH_MS);
    const onFocus = () => {
      if (Date.now() - lastLoad > 10_000) void refreshCredits();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return credits;
}
