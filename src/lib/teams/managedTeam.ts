import type { SourcingClient } from "@/lib/supabase/types";

/** The team the user manages (teams.manager_id is the only source of truth), or null. */
export async function managedTeamId(supabase: SourcingClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("teams").select("id").eq("manager_id", userId).maybeSingle();
  return data?.id ?? null;
}
