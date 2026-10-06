/**
 * Search credits shared by a tenant (everyone on the same API keys): the
 * daily / weekly / monthly search limits, what's used, and what the
 * providers' own quotas still allow. Client-safe: types and pure logic only.
 */

export const USAGE_PERIODS = ["day", "week", "month"] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export interface SearchLimits {
  daily: number;
  weekly: number;
  monthly: number;
}

/**
 * Sized for the free tiers (UAT): 10 profiles a search at $0.005 fit Apify's
 * renewing $5 a month about 76 times after the buffer, so 70 a month,
 * spread over 5 recruiters.
 */
export const DEFAULT_SEARCH_LIMITS: SearchLimits = {
  daily: 6,
  weekly: 20,
  monthly: 70,
};

/** Highest limit an admin can set for any period. */
export const MAX_SEARCH_LIMIT = 10_000;

export const PERIOD_LABELS: Record<UsagePeriod, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
};

const LIMIT_NAMES: Record<UsagePeriod, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

export interface UsageWindow {
  period: UsagePeriod;
  used: number;
  limit: number;
  left: number;
  startsAt: string;
  resetsAt: string;
  spendUsd: number;
}

export type QuotaStatus = "ok" | "low" | "out" | "unknown";

export interface ProviderQuota {
  provider: "serper" | "apify" | "harvestapi" | "openai";
  label: string;
  /** What the provider does in a search. */
  role: "search" | "enrich" | "ai";
  status: QuotaStatus;
  /** e.g. "2,393 credits" or "$3.41 of $5.00". */
  left: string;
  /** e.g. "Resets Oct 12" or "No balance API; spent $0.23". */
  detail: string | null;
  /** Searches the quota still covers at the average cost, if measurable. */
  searchesLeft: number | null;
  /** When the quota renews, if it does. */
  resetsAt?: string | null;
}

export interface CreditsSnapshot {
  limits: SearchLimits;
  windows: UsageWindow[];
  providers: ProviderQuota[];
  /** Fewest searches left across the limits and the providers' quotas. */
  searchesLeft: number;
  blocked: { reason: string; resetsAt: string | null } | null;
  avgCostPerSearchUsd: number | null;
  sampleRuns: number;
  checkedAt: string;
}

export interface UsageRow {
  period: string;
  starts_at: string;
  resets_at: string;
  searches: number;
  spend_usd: number | string;
}

export function limitFor(limits: SearchLimits, period: UsagePeriod): number {
  return period === "day"
    ? limits.daily
    : period === "week"
      ? limits.weekly
      : limits.monthly;
}

export function buildWindows(
  rows: UsageRow[],
  limits: SearchLimits,
): UsageWindow[] {
  return USAGE_PERIODS.flatMap((period) => {
    const row = rows.find((r) => r.period === period);
    if (!row) return [];
    const limit = limitFor(limits, period);
    return [
      {
        period,
        used: row.searches,
        limit,
        left: Math.max(0, limit - row.searches),
        startsAt: row.starts_at,
        resetsAt: row.resets_at,
        spendUsd: Number(row.spend_usd) || 0,
      },
    ];
  });
}

/**
 * Safety margin kept unused on every provider quota: 20% of what's left, and
 * never less than 2 searches' worth. Runs vary a little in cost, and a search
 * that runs a provider dry halfway through wastes what it already spent.
 */
export const QUOTA_BUFFER_SHARE = 0.2;
export const QUOTA_BUFFER_MIN_SEARCHES = 2;

/** Searches still allowed out of `searches` once the buffer is held back. */
export function afterBuffer(searches: number): number {
  const buffer = Math.max(
    QUOTA_BUFFER_MIN_SEARCHES,
    Math.ceil(searches * QUOTA_BUFFER_SHARE),
  );
  return Math.max(0, searches - buffer);
}

/**
 * Whole searches `left` covers at `perSearch` each, minus the safety
 * buffer; null if unmeasurable.
 */
export function searchesCovered(
  left: number | null,
  perSearch: number | null,
): number | null {
  if (left === null || perSearch === null || !(perSearch > 0)) return null;
  return afterBuffer(Math.max(0, Math.floor(left / perSearch)));
}

export function quotaStatus(searchesLeft: number | null): QuotaStatus {
  if (searchesLeft === null) return "unknown";
  if (searchesLeft <= 0) return "out";
  return searchesLeft <= 3 ? "low" : "ok";
}

/**
 * Searches left overall: the tightest limit window, the search provider's
 * quota, and the enrichment quotas combined (Apify falls back to HarvestAPI,
 * so they add up — counted only when every one of them is measurable).
 */
export function overallSearchesLeft(
  windows: UsageWindow[],
  providers: ProviderQuota[],
): number {
  const candidates = windows.map((w) => w.left);
  for (const p of providers) {
    if (p.role === "search" && p.searchesLeft !== null)
      candidates.push(p.searchesLeft);
  }
  const enrich = providers.filter((p) => p.role === "enrich");
  if (enrich.length > 0 && enrich.every((p) => p.searchesLeft !== null)) {
    candidates.push(enrich.reduce((sum, p) => sum + (p.searchesLeft ?? 0), 0));
  }
  return candidates.length > 0 ? Math.max(0, Math.min(...candidates)) : 0;
}

/**
 * Why a new search can't start, if it can't: a used-up limit (the one that
 * resets last wins, since that's when searching is possible again), a
 * search provider out of credits, or every profile provider out of credit
 * (the search would pay for results it can't read or score).
 */
export function blockedReason(
  windows: UsageWindow[],
  providers: ProviderQuota[],
): CreditsSnapshot["blocked"] {
  const full = windows.filter((w) => w.left <= 0);
  if (full.length > 0) {
    const last = full.reduce((a, b) =>
      Date.parse(b.resetsAt) > Date.parse(a.resetsAt) ? b : a,
    );
    return {
      reason: `${LIMIT_NAMES[last.period]} limit of ${last.limit} ${last.limit === 1 ? "search" : "searches"} reached.`,
      resetsAt: last.resetsAt,
    };
  }
  const search = providers.find(
    (p) => p.role === "search" && p.status === "out",
  );
  if (search) {
    return {
      reason: `${search.label} has no search credits left.`,
      resetsAt: null,
    };
  }
  const enrich = providers.filter((p) => p.role === "enrich");
  if (enrich.length > 0 && enrich.every((p) => p.status === "out")) {
    const resets = enrich
      .map((p) => p.resetsAt)
      .filter((r): r is string => Boolean(r))
      .sort();
    return {
      reason: `${enrich.map((p) => p.label).join(" and ")} ${enrich.length === 1 ? "has" : "have"} no profile credit left.`,
      resetsAt: resets[0] ?? null,
    };
  }
  return null;
}

/** "in 5h 12m", "in 3d 4h", "in 12m" (minimum 1m). */
export function formatResetsIn(resetsAt: string, now = Date.now()): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(resetsAt) - now) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `in ${days}d${hours ? ` ${hours}h` : ""}`;
  if (hours > 0) return `in ${hours}h${mins ? ` ${mins}m` : ""}`;
  return `in ${mins}m`;
}

export function formatUsd(value: number): string {
  return `$${value < 10 ? value.toFixed(2) : value.toFixed(0)}`;
}
