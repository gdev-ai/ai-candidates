import type { SourcingClient } from "@/lib/supabase/types";

export class InvalidManagerError extends Error {}

/**
 * Makes `managerId` the manager of `teamId` (null clears it).
 * teams.manager_id is the only source of truth for who manages a team (RLS
 * visibility and notifications both key on it) and it's unique, so a
 * manager leads at most one team: they're released from any other team
 * first, then assigned here. The manager is also placed in the team so
 * team listings show them. Caller must be an admin (RLS enforces this on
 * both tables).
 */
export async function assignTeamManager(
  supabase: SourcingClient,
  teamId: string,
  managerId: string | null,
): Promise<void> {
  if (managerId) {
    const { data: manager, error } = await supabase
      .from("members")
      .select("user_id, role, status, team_id")
      .eq("user_id", managerId)
      .maybeSingle();
    if (error) throw error;
    if (!manager || manager.role !== "hr_manager" || manager.status !== "active") {
      throw new InvalidManagerError("The selected manager must be an active HR Manager.");
    }

    const { error: releaseError } = await supabase
      .from("teams")
      .update({ manager_id: null })
      .eq("manager_id", managerId)
      .neq("id", teamId);
    if (releaseError) throw releaseError;

    if (manager.team_id !== teamId) {
      const { error: moveError } = await supabase
        .from("members")
        .update({ team_id: teamId })
        .eq("user_id", managerId);
      if (moveError) throw moveError;
    }
  }

  const { error: assignError } = await supabase
    .from("teams")
    .update({ manager_id: managerId })
    .eq("id", teamId);
  if (assignError) throw assignError;
}

/**
 * Keeps teams.manager_id consistent after a member edit: someone who is no
 * longer an active HR Manager, or who moved out of the team they led, stops
 * leading it. An active HR Manager placed in a team with no manager becomes
 * its manager (an existing manager is never replaced implicitly).
 */
export async function syncManagerAfterMemberChange(
  supabase: SourcingClient,
  member: { user_id: string; role: string; status: string; team_id: string | null },
): Promise<void> {
  const leads = member.role === "hr_manager" && member.status === "active" && member.team_id !== null;

  let release = supabase.from("teams").update({ manager_id: null }).eq("manager_id", member.user_id);
  if (leads) release = release.neq("id", member.team_id!);
  const { error: releaseError } = await release;
  if (releaseError) throw releaseError;

  if (leads) {
    const { error } = await supabase
      .from("teams")
      .update({ manager_id: member.user_id })
      .eq("id", member.team_id!)
      .is("manager_id", null);
    if (error) throw error;
  }
}
