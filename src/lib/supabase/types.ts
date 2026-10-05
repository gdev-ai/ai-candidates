import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

/**
 * The app's tables live in the `sourcing` schema of the shared HR Portal
 * project (see docs/db-redesign.md). Every client is pinned to it; HR
 * Portal's own `public` tables are reached explicitly with
 * `.schema("public")` (only `companies` today).
 */
export const DB_SCHEMA = "sourcing" as const;

export type SourcingClient = SupabaseClient<Database, typeof DB_SCHEMA>;

type SourcingSchema = Database[typeof DB_SCHEMA];

export type Row<T extends keyof SourcingSchema["Tables"]> = SourcingSchema["Tables"][T]["Row"];
export type Insert<T extends keyof SourcingSchema["Tables"]> = SourcingSchema["Tables"][T]["Insert"];
export type Update<T extends keyof SourcingSchema["Tables"]> = SourcingSchema["Tables"][T]["Update"];
