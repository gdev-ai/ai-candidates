import type { Member } from "@/lib/auth/access";
import { MEMBER_ROW_COLUMNS, toMemberRow, type MemberRow } from "@/lib/performance/userStats";
import type { SourcingClient } from "@/lib/supabase/types";
import { managedTeamId } from "@/lib/teams/managedTeam";

export interface ReportScope {
  kind: "user" | "team" | "org";
  label: string;
  teamId: string | null;
  members: MemberRow[];
}

/**
 * Decides whose data a report covers, from the caller's role alone:
 *  - HR User: only themselves.
 *  - HR Manager: the team they manage (teams.manager_id; a requested team
 *    id is ignored), or just themselves if they lead no team.
 *  - Admin: the whole organization, or one team if `requestedTeamId` names one.
 * The member list is read through RLS, so even a wrong decision here can't
 * surface people the caller isn't allowed to see — and every report query
 * is RLS-scoped again on top of that. Pending members (access requests)
 * are never included.
 */
export async function resolveReportScope(
  supabase: SourcingClient,
  member: Member,
  requestedTeamId: string | null,
): Promise<{ scope: ReportScope; teamOptions: { id: string; name: string }[] | null }> {
  const membersQuery = () =>
    supabase.from("members").select(MEMBER_ROW_COLUMNS).neq("status", "pending");

  if (member.role === "admin") {
    const { data: teams } = await supabase.from("teams").select("id, name").order("name");
    const teamOptions = teams ?? [];
    const team = teamOptions.find((option) => option.id === requestedTeamId);

    const { data } = team ? await membersQuery().eq("team_id", team.id) : await membersQuery();
    return {
      scope: {
        kind: team ? "team" : "org",
        label: team ? team.name : "Whole organization",
        teamId: team?.id ?? null,
        members: (data ?? []).map(toMemberRow),
      },
      teamOptions,
    };
  }

  if (member.role === "hr_manager") {
    const teamId = await managedTeamId(supabase, member.user_id);
    if (teamId) {
      const [{ data: team }, { data: members }] = await Promise.all([
        supabase.from("teams").select("name").eq("id", teamId).maybeSingle(),
        membersQuery().eq("team_id", teamId),
      ]);
      return {
        scope: {
          kind: "team",
          label: team?.name ?? "My team",
          teamId,
          members: (members ?? []).map(toMemberRow),
        },
        teamOptions: null,
      };
    }
  }

  const { data: self } = await supabase
    .from("members")
    .select(MEMBER_ROW_COLUMNS)
    .eq("user_id", member.user_id)
    .maybeSingle();
  return {
    scope: {
      kind: "user",
      label: "My work",
      teamId: null,
      members: self ? [toMemberRow(self)] : [],
    },
    teamOptions: null,
  };
}
