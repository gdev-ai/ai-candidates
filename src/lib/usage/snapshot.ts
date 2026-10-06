import "server-only";

import { APIFY_RESERVE_USD } from "@/lib/enrichment";
import { getApifyUsage, isApifyConfigured } from "@/lib/enrichment/apify";
import { isHarvestConfigured } from "@/lib/enrichment/harvestapi";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { fetchJson } from "@/lib/providers/http";
import {
  APIFY_SUPREME_USD_PER_PROFILE,
  HARVESTAPI_USD_PER_PROFILE,
} from "@/lib/providers/pricing";
import { createServiceClient } from "@/lib/supabase/service";
import type { SourcingClient } from "@/lib/supabase/types";
import {
  blockedReason,
  buildWindows,
  DEFAULT_SEARCH_LIMITS,
  formatUsd,
  overallSearchesLeft,
  quotaStatus,
  searchesCovered,
  type CreditsSnapshot,
  type ProviderQuota,
  type SearchLimits,
  type UsageWindow,
} from "@/lib/usage/credits";
import { tenantKey } from "@/lib/usage/tenant";
import { CANDIDATES_PER_RUN } from "@/types/job";

const log = createLogger("usage");

/** Calendar used for the daily / weekly / monthly windows. */
export const USAGE_TIME_ZONE = "Africa/Cairo";
/** Recent finished runs the per-search averages are measured from. */
const SAMPLE_RUNS = 20;
/** Live provider balances are re-read at most this often. */
const PROVIDER_CACHE_MS = 60_000;
/** Before any run is measured: a search's Serper credits (≈ 3 queries × 3 pages). */
const FALLBACK_SERPER_CREDITS = 10;

export async function getSearchLimits(
  db: SourcingClient,
  tenant = tenantKey(),
): Promise<SearchLimits> {
  const { data, error } = await db
    .from("usage_limits")
    .select("daily_searches, weekly_searches, monthly_searches")
    .eq("tenant_key", tenant)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        daily: data.daily_searches,
        weekly: data.weekly_searches,
        monthly: data.monthly_searches,
      }
    : DEFAULT_SEARCH_LIMITS;
}

async function usageRows(db: SourcingClient, tenant: string) {
  const { data, error } = await db.rpc("search_usage", {
    p_tenant: tenant,
    p_tz: USAGE_TIME_ZONE,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getUsageWindows(
  db: SourcingClient,
  limits: SearchLimits,
  tenant = tenantKey(),
): Promise<UsageWindow[]> {
  return buildWindows(await usageRows(db, tenant), limits);
}

interface PerSearch {
  serperCredits: number | null;
  profiles: number | null;
  costUsd: number | null;
  runs: number;
}

/** Averages over the tenant's recent finished runs. */
async function measurePerSearch(
  db: SourcingClient,
  tenant: string,
): Promise<PerSearch> {
  const { data: runs, error } = await db
    .from("search_runs")
    .select("id")
    .eq("tenant_key", tenant)
    .eq("status", "complete")
    .order("completed_at", { ascending: false })
    .limit(SAMPLE_RUNS);
  if (error) throw error;
  const ids = (runs ?? []).map((r) => r.id);
  if (ids.length === 0)
    return { serperCredits: null, profiles: null, costUsd: null, runs: 0 };

  const { data: calls, error: callsError } = await db
    .from("provider_calls")
    .select("provider, purpose, credits, cost_usd")
    .in("search_run_id", ids);
  if (callsError) throw callsError;

  let serper = 0;
  let profiles = 0;
  let cost = 0;
  for (const c of calls ?? []) {
    cost += Number(c.cost_usd ?? 0);
    if (c.provider === "serper") serper += Number(c.credits ?? 0);
    if (c.purpose === "enrich") profiles += Number(c.credits ?? 0);
  }
  const n = ids.length;
  return {
    serperCredits: serper / n,
    profiles: profiles / n,
    costUsd: cost / n,
    runs: n,
  };
}

async function spentUsd(
  db: SourcingClient,
  tenant: string,
  provider: string,
  since?: string,
): Promise<number> {
  let query = db
    .from("provider_calls")
    .select("cost_usd")
    .eq("tenant_key", tenant)
    .eq("provider", provider);
  if (since) query = query.gte("created_at", since);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: USAGE_TIME_ZONE,
  });

interface LiveBalances {
  serperCredits: number | null;
  apify: Awaited<ReturnType<typeof getApifyUsage>> | null;
  at: number;
}

let liveCache: LiveBalances | null = null;

/** Serper and Apify balances, straight from their APIs (cached briefly). */
async function liveBalances(): Promise<LiveBalances> {
  if (liveCache && Date.now() - liveCache.at < PROVIDER_CACHE_MS)
    return liveCache;
  const [serper, apify] = await Promise.all([
    env.SEARCH_PROVIDER === "serper" && env.SERPER_API_KEY
      ? fetchJson<{ balance?: number }>(
          "serper",
          "https://google.serper.dev/account",
          {
            method: "GET",
            headers: { "X-API-KEY": env.SERPER_API_KEY },
            timeoutMs: 10_000,
            retries: 0,
          },
        )
          .then(({ body }) =>
            typeof body.balance === "number" ? body.balance : null,
          )
          .catch((error: unknown) => {
            log.warn("Serper balance check failed", { error });
            return null;
          })
      : Promise.resolve(null),
    isApifyConfigured() && env.ENRICHMENT_PROVIDER !== "harvestapi"
      ? getApifyUsage().catch((error: unknown) => {
          log.warn("Apify limits check failed", { error });
          return null;
        })
      : Promise.resolve(null),
  ]);
  liveCache = { serperCredits: serper, apify, at: Date.now() };
  return liveCache;
}

async function providerQuotas(
  db: SourcingClient,
  tenant: string,
  perSearch: PerSearch,
  monthStart: string | undefined,
  live: LiveBalances,
): Promise<ProviderQuota[]> {
  const showHarvest =
    isHarvestConfigured() && env.ENRICHMENT_PROVIDER !== "apify";
  const [harvestSpent, openaiSpent] = await Promise.all([
    showHarvest ? spentUsd(db, tenant, "harvestapi") : 0,
    env.OPENAI_API_KEY ? spentUsd(db, tenant, "openai", monthStart) : 0,
  ]);
  const quotas: ProviderQuota[] = [];
  const profiles = perSearch.profiles || CANDIDATES_PER_RUN;

  if (env.SEARCH_PROVIDER === "serper" && env.SERPER_API_KEY) {
    const left = live.serperCredits;
    const searchesLeft = searchesCovered(
      left,
      perSearch.serperCredits || FALLBACK_SERPER_CREDITS,
    );
    quotas.push({
      provider: "serper",
      label: "Serper",
      role: "search",
      status: left === null ? "unknown" : quotaStatus(searchesLeft),
      left:
        left === null
          ? "Unavailable"
          : `${left.toLocaleString("en-US")} credits`,
      detail: "One-time credit, never renews",
      searchesLeft,
    });
  }

  if (isApifyConfigured() && env.ENRICHMENT_PROVIDER !== "harvestapi") {
    const usage = live.apify;
    const usable =
      usage === null
        ? null
        : Math.max(0, usage.remainingUsd - APIFY_RESERVE_USD);
    const searchesLeft = searchesCovered(
      usable,
      profiles * APIFY_SUPREME_USD_PER_PROFILE,
    );
    quotas.push({
      provider: "apify",
      label: "Apify",
      role: "enrich",
      status: usage === null ? "unknown" : quotaStatus(searchesLeft),
      left:
        usage === null
          ? "Unavailable"
          : `${formatUsd(usage.remainingUsd)} of ${formatUsd(usage.maxUsd)}`,
      detail: usage?.cycleEndsAt
        ? `Monthly credit, renews ${shortDate(usage.cycleEndsAt)}`
        : "Monthly credit",
      searchesLeft,
      resetsAt: usage?.cycleEndsAt ?? null,
    });
  }

  if (showHarvest) {
    const spent = harvestSpent;
    const prepaid = env.HARVESTAPI_PREPAID_USD;
    const left = prepaid === undefined ? null : Math.max(0, prepaid - spent);
    const searchesLeft = searchesCovered(
      left,
      profiles * HARVESTAPI_USD_PER_PROFILE,
    );
    quotas.push({
      provider: "harvestapi",
      label: "HarvestAPI",
      role: "enrich",
      status: quotaStatus(searchesLeft),
      left:
        left === null
          ? `${formatUsd(spent)} spent`
          : `${formatUsd(left)} of ${formatUsd(prepaid ?? 0)}`,
      detail:
        left === null
          ? "Pay as you go; no balance API"
          : "One-time credit, never renews",
      searchesLeft,
    });
  }

  if (env.OPENAI_API_KEY) {
    const spent = openaiSpent;
    quotas.push({
      provider: "openai",
      label: "OpenAI",
      role: "ai",
      status: "ok",
      left: `${formatUsd(spent)} this month`,
      detail: "Billed by usage; no balance API",
      searchesLeft: null,
    });
  }
  return quotas;
}

/** Everything the credits counter shows, shared by everyone on these keys. */
export async function getCreditsSnapshot(): Promise<CreditsSnapshot> {
  const db = createServiceClient();
  const tenant = tenantKey();
  const [limits, rows, perSearch, live] = await Promise.all([
    getSearchLimits(db, tenant),
    usageRows(db, tenant),
    measurePerSearch(db, tenant),
    liveBalances(),
  ]);
  const windows = buildWindows(rows, limits);
  const monthStart = windows.find((w) => w.period === "month")?.startsAt;
  const providers = await providerQuotas(
    db,
    tenant,
    perSearch,
    monthStart,
    live,
  );
  return {
    limits,
    windows,
    providers,
    searchesLeft: overallSearchesLeft(windows, providers),
    blocked: blockedReason(windows, providers),
    avgCostPerSearchUsd: perSearch.costUsd,
    sampleRuns: perSearch.runs,
    checkedAt: new Date().toISOString(),
  };
}

/** Drops cached balances so the next snapshot re-reads them. */
export function invalidateLiveBalances(): void {
  liveCache = null;
}
