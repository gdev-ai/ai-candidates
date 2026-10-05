import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { DB_SCHEMA, type SourcingClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database.types";

let client: SourcingClient | null = null;

/**
 * Service-role client: bypasses RLS. Only for server work that has no user
 * session (background search runs) or writes tables users can't
 * (people, provider_calls, search_hits, match_results...). Callers must
 * enforce ownership themselves — filter by owner/job explicitly.
 */
export function createServiceClient(): SourcingClient {
  client ??= createClient<Database, typeof DB_SCHEMA>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      db: { schema: DB_SCHEMA },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return client;
}
