import { env } from "@/lib/env";
import { mapHarvestElement, type HarvestElement } from "@/lib/enrichment/mapHarvest";
import type { EnrichedProfile } from "@/lib/enrichment/types";
import { fetchJson, ProviderHttpError } from "@/lib/providers/http";
import { HARVESTAPI_USD_PER_PROFILE } from "@/lib/providers/pricing";

const ENDPOINT = "https://api.harvestapi.io/linkedin/profile";

export function isHarvestConfigured(): boolean {
  return Boolean(env.HARVESTAPI_API_KEY);
}

interface HarvestResponse {
  element?: HarvestElement | null;
  status?: number;
  error?: string | null;
  cost?: number;
  requestId?: string;
  query?: { url?: string; publicIdentifier?: string; profileId?: string };
}

export interface HarvestFetchResult {
  profile: EnrichedProfile | null;
  notFound: boolean;
  costUsd: number;
  requestId: string | null;
  httpStatus: number | null;
  raw: unknown;
  latencyMs: number;
}

/**
 * HarvestAPI direct API, the enrichment fallback (verified live
 * 2026-10-04). One profile per request; X-API-Key header.
 */
export async function fetchHarvestProfile(profileUrl: string): Promise<HarvestFetchResult> {
  if (!env.HARVESTAPI_API_KEY) throw new Error("HARVESTAPI_API_KEY is not set.");
  const url = `${ENDPOINT}?query=${encodeURIComponent(profileUrl)}`;
  const startedAt = Date.now();
  try {
    const { status, body } = await fetchJson<HarvestResponse>("harvestapi", url, {
      method: "GET",
      headers: { "X-API-Key": env.HARVESTAPI_API_KEY },
      timeoutMs: 60_000,
    });
    const element = body.element ?? null;
    return {
      profile: element?.publicIdentifier ? mapHarvestElement(element, profileUrl) : null,
      notFound: !element?.publicIdentifier,
      costUsd: typeof body.cost === "number" ? body.cost : element ? HARVESTAPI_USD_PER_PROFILE : 0,
      requestId: body.requestId ?? null,
      httpStatus: status,
      raw: body,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof ProviderHttpError && error.status === 404) {
      return {
        profile: null,
        notFound: true,
        costUsd: 0,
        requestId: null,
        httpStatus: 404,
        raw: error.body ?? null,
        latencyMs: Date.now() - startedAt,
      };
    }
    throw error;
  }
}
