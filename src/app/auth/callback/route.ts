import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity/log";
import { ensureMember } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

/** Target of the Microsoft sign-in redirect and Supabase email links. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";

  // On a provider failure (no email returned, wrong secret, ...) Supabase
  // redirects here without a code but with the reason attached.
  const failed = (detail?: string | null) => {
    if (detail) console.error("[auth/callback] sign-in failed:", detail);
    const url = new URL("/login", origin);
    url.searchParams.set("error", "link_failed");
    if (detail) url.searchParams.set("detail", detail.slice(0, 300));
    return NextResponse.redirect(url);
  };

  if (!code) {
    return failed(searchParams.get("error_description"));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return failed(error?.message ?? "No user returned");
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
