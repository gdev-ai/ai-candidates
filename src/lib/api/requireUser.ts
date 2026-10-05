import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { getMember, isActive, type Member } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

/**
 * The gate every API route passes first: a signed-in user with an active
 * sourcing membership. Disabling someone in Admin therefore cuts off every
 * API immediately, not just the admin/manager ones.
 */
export async function requireUser(): Promise<
  | { user: User; supabase: Awaited<ReturnType<typeof createClient>>; member: Member }
  | { error: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const member = await getMember(supabase, user.id);
  if (!isActive(member)) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { user, supabase, member };
}
