import type { Role } from "@/lib/auth/roleDefinitions";
import type { Row, SourcingClient } from "@/lib/supabase/types";

export type MemberStatus = "pending" | "active" | "disabled";

export interface Member {
  user_id: string;
  email: string;
  full_name: string | null;
  role: Role;
  team_id: string | null;
  status: MemberStatus;
}

const MEMBER_COLUMNS = "user_id, email, full_name, role, team_id, status";

function toMember(row: Pick<Row<"members">, "user_id" | "email" | "full_name" | "role" | "team_id" | "status">): Member {
  return {
    ...row,
    role: row.role as Role,
    status: row.status as MemberStatus,
  };
}

/** The caller's sourcing membership, or null if they have never signed in here. */
export async function getMember(supabase: SourcingClient, userId: string): Promise<Member | null> {
  const { data, error } = await supabase
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return toMember(data);
}

/**
 * Returns the caller's membership, creating it on first sign-in. The
 * database function makes invited users active with their invited role and
 * team, and everyone else a pending access request that notifies admins.
 * There is deliberately no trigger on auth.users: that table is shared with
 * HR Portal, whose signups must not become sourcing members.
 */
export async function ensureMember(supabase: SourcingClient): Promise<Member | null> {
  const { data, error } = await supabase.rpc("ensure_member").single();
  if (error || !data) return null;
  return toMember(data);
}

export function isActive(member: Member | null): member is Member & { status: "active" } {
  return member?.status === "active";
}
