import { env } from "@/lib/env";
import { fetchJson, ProviderHttpError } from "@/lib/providers/http";
import { apifyMaxChargeUsd } from "@/lib/providers/pricing";
import type { SupremeItem } from "@/lib/enrichment/mapSupreme";

const API = "https://api.apify.com/v2";

export class ApifyRunLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApifyRunLimitError";
  }
}

function token(): string {
  if (!env.APIFY_API_TOKEN) throw new Error("APIFY_API_TOKEN is not set.");
  return env.APIFY_API_TOKEN;
}

const auth = () => ({ Authorization: `Bearer ${token()}` });

export const SUPREME_ACTOR_ID = "supreme_coder~linkedin-profile-scraper";
/** Retired: its free-plan run cap is lifetime and blocked runs still bill (§8.3). */
const RETIRED_ACTORS =
  /harvestapi[~/]linkedin-profile-scraper|LpVuK3Zozwuipa5bp/i;

/** The configured actor, never the retired harvestapi one (even if env still names it). */
export function enrichmentActorId(): string {
  const configured = env.APIFY_ACTOR_ID?.trim();
  if (!configured || RETIRED_ACTORS.test(configured)) return SUPREME_ACTOR_ID;
  return configured;
}

export function isApifyConfigured(): boolean {
  return Boolean(env.APIFY_API_TOKEN);
}

interface LimitsResponse {
  data?: {
    monthlyUsageCycle?: { endAt?: string };
    limits?: { maxMonthlyUsageUsd?: number };
    current?: { monthlyUsageUsd?: number };
  };
}

export interface ApifyUsage {
  maxUsd: number;
  usedUsd: number;
  remainingUsd: number;
  /** When the monthly credit renews. */
  cycleEndsAt: string | null;
}

/** This billing cycle's credit (GET /v2/users/me/limits). */
export async function getApifyUsage(): Promise<ApifyUsage> {
  const { body } = await fetchJson<LimitsResponse>(
    "apify",
    `${API}/users/me/limits`,
    {
      method: "GET",
      headers: auth(),
      timeoutMs: 20_000,
    },
  );
  const maxUsd = body.data?.limits?.maxMonthlyUsageUsd ?? 0;
  const usedUsd = body.data?.current?.monthlyUsageUsd ?? 0;
  return {
    maxUsd,
    usedUsd,
    remainingUsd: Math.max(0, maxUsd - usedUsd),
    cycleEndsAt: body.data?.monthlyUsageCycle?.endAt ?? null,
  };
}

/** Credit left this billing cycle. */
export async function getApifyRemainingUsd(): Promise<number> {
  return (await getApifyUsage()).remainingUsd;
}

export interface ApifyRun {
  id: string;
  status: string;
  statusMessage: string | null;
  defaultDatasetId: string | null;
  usageTotalUsd: number | null;
  chargedEventCounts: Record<string, number> | null;
  raw: unknown;
}

interface RunResponse {
  data?: {
    id?: string;
    status?: string;
    statusMessage?: string;
    defaultDatasetId?: string;
    usageTotalUsd?: number;
    chargedEventCounts?: Record<string, number>;
  };
}

function toRun(body: RunResponse): ApifyRun {
  const d = body.data ?? {};
  if (!d.id) throw new Error("Apify returned no run id.");
  return {
    id: d.id,
    status: d.status ?? "UNKNOWN",
    statusMessage: d.statusMessage ?? null,
    defaultDatasetId: d.defaultDatasetId ?? null,
    usageTotalUsd: d.usageTotalUsd ?? null,
    chargedEventCounts: d.chargedEventCounts ?? null,
    raw: body.data ?? null,
  };
}

export const TERMINAL_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "TIMED-OUT",
  "ABORTED",
]);

export function supremeInput(urls: string[]) {
  return {
    urls: urls.map((url) => ({ url })),
    scrapeCompany: false,
    findContacts: false,
  };
}

/**
 * Starts an async run with a hard cost cap and 180 s timeout. Retries only
 * 429/5xx (no run was created); a timeout is not retried because a run may
 * already exist and bill.
 */
export async function startSupremeRun(urls: string[]): Promise<ApifyRun> {
  const url = new URL(
    `${API}/acts/${encodeURIComponent(enrichmentActorId())}/runs`,
  );
  url.searchParams.set("timeout", "180");
  url.searchParams.set("memory", "256");
  url.searchParams.set(
    "maxTotalChargeUsd",
    String(apifyMaxChargeUsd(urls.length)),
  );
  const { body } = await fetchJson<RunResponse>("apify", url.toString(), {
    method: "POST",
    headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify(supremeInput(urls)),
    timeoutMs: 30_000,
  });
  return toRun(body);
}

/** Long-polls a run for up to `waitSecs` (max 60). */
export async function getApifyRun(
  runId: string,
  waitSecs = 60,
): Promise<ApifyRun> {
  const { body } = await fetchJson<RunResponse>(
    "apify",
    `${API}/actor-runs/${encodeURIComponent(runId)}?waitForFinish=${waitSecs}`,
    { method: "GET", headers: auth(), timeoutMs: (waitSecs + 15) * 1000 },
  );
  const run = toRun(body);
  if (run.status === "FAILED" && /limit/i.test(run.statusMessage ?? "")) {
    throw new ApifyRunLimitError(
      run.statusMessage ?? "Apify run limit reached",
    );
  }
  return run;
}

export async function getDatasetItems(
  datasetId: string,
): Promise<SupremeItem[]> {
  const { body } = await fetchJson<SupremeItem[]>(
    "apify",
    `${API}/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`,
    { method: "GET", headers: auth(), timeoutMs: 60_000 },
  );
  return Array.isArray(body) ? body : [];
}

export { ProviderHttpError };
