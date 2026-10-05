import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { requireUser } from "@/lib/api/requireUser";
import type { Member } from "@/lib/auth/access";
import type { Role } from "@/lib/auth/roleDefinitions";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Same gate as requireUser (signed in, active member), plus a role check.
 * This is enforced again at the database level by RLS on every table the
 * resulting handler touches — this check exists to fail fast with a clear
 * 403 rather than relying solely on RLS silently returning empty results.
 */
export async function requireRole(
  allowedRoles: readonly Role[],
): Promise<
  | { user: User; supabase: SupabaseClient; member: Member }
  | { error: NextResponse }
> {
  const auth = await requireUser();
  if ("error" in auth) return auth;

  if (!allowedRoles.includes(auth.member.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return auth;
}
