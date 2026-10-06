import "server-only";

import { createHash } from "node:crypto";

import { env } from "@/lib/env";

let cached: string | null = null;

/**
 * Who shares a search budget: everyone running on the same paid provider
 * API keys. The key is a short hash of those keys (never the keys
 * themselves), or USAGE_TENANT when set — so a key rotation can keep the
 * same budget and history.
 */
export function tenantKey(): string {
  if (cached) return cached;
  if (env.USAGE_TENANT) {
    cached = `name:${env.USAGE_TENANT}`;
    return cached;
  }
  const keys = [
    ["openai", env.OPENAI_API_KEY],
    ["serper", env.SERPER_API_KEY],
    ["serpapi", env.SERPAPI_API_KEY],
    ["exa", env.EXA_API_KEY],
    ["apify", env.APIFY_API_TOKEN],
    ["harvestapi", env.HARVESTAPI_API_KEY],
  ]
    .filter(([, value]) => value?.trim())
    .map(([name, value]) => `${name}=${value!.trim()}`)
    .join("\n");
  cached = `keys:${createHash("sha256").update(keys).digest("hex").slice(0, 16)}`;
  return cached;
}
