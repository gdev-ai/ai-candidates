import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { getMember, isActive, type Member } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import type { SourcingClient } from "@/lib/supabase/types";

export interface PageSession {
  supabase: SourcingClient;
  user: User;
  member: Member;
}

/**
 * Server-component gate: a signed-in, active member, or a redirect to
 * /login. Middleware already enforces this; repeating it here gives pages a
 * typed member without trusting that the middleware ran.
 */
export async function requirePageMember(): Promise<PageSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const member = await getMember(supabase, user.id);
  if (!isActive(member)) redirect("/login");

  return { supabase, user, member };
}
