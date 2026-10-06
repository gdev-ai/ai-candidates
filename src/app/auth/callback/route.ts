import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity/log";
import { ensureMember } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

/** Target of email confirmation links (see signUpWithPassword) and the Microsoft sign-in redirect. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=link_failed`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=link_failed`);
  }

  const method =
    data.user.app_metadata?.provider === "azure" ? "microsoft" : "email_link";
  const member = await ensureMember(supabase);
  if (member?.status !== "active") {
    await supabase.auth.signOut();
    const reason =
      member?.status === "pending" ? "pending_approval" : "not_allowed";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  await logActivity(supabase, {
    userId: data.user.id,
    action: "auth.login",
    entityType: "auth",
    entityId: data.user.id,
    description:
      method === "microsoft"
        ? "Signed in with Microsoft"
        : "Signed in from an email link",
    metadata: { method },
  });

  // Same-origin paths only ("//host" would leave the site).
  const safePath =
    redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : "/dashboard";
  return NextResponse.redirect(`${origin}${safePath}`);
}
