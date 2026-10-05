import { redirect } from "next/navigation";

import { requirePageMember, type PageSession } from "@/lib/dashboard/session";
import { managedTeamId } from "@/lib/teams/managedTeam";

export interface ManagerScope extends PageSession {
  /** The team this page shows, or null if an HR Manager leads no team yet. */
  teamId: string | null;
  /** Admins can switch teams; HR Managers are pinned to the team they manage. */
  teamOptions: { id: string; name: string }[] | null;
}

/**
 * Resolves which team a manager-level page may show. An HR Manager always
 * gets the team they manage — a `teamId` in the URL is ignored for them, so
 * it can't be used to point at another team. Admins may pick any team.
 * Everyone else is sent back to their own dashboard. RLS
 * (visible_owner_ids) enforces the same boundaries on every query.
 */
export async function resolveManagerScope(requestedTeamId: string | null): Promise<ManagerScope> {
  const session = await requirePageMember();
  const { supabase, user, member } = session;

  if (member.role === "hr_manager") {
    return { ...session, teamId: await managedTeamId(supabase, user.id), teamOptions: null };
  }

  if (member.role === "admin") {
    const { data } = await supabase.from("teams").select("id, name").order("name");
    const teamOptions = data ?? [];
    const teamId =
      teamOptions.find((team) => team.id === requestedTeamId)?.id ?? teamOptions[0]?.id ?? null;
    return { ...session, teamId, teamOptions };
  }

  redirect("/dashboard");
}
