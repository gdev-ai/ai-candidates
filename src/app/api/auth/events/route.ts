import { NextResponse } from "next/server";
import { z } from "zod";

import { logActivity } from "@/lib/activity/log";
import { ensureMember, isActive } from "@/lib/auth/access";
import { withErrorHandling } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const eventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("login") }),
  z.object({ event: z.literal("logout") }),
  z.object({
    event: z.literal("login_failed"),
    email: z.string().trim().email().max(320),
  }),
]);

/** Most failed-login entries kept per account per hour. */
const FAILED_LOGIN_CAP_PER_HOUR = 10;

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}

/**
 * Failed sign-ins have no session, so they can't be written under
 * activity_log's own-row policy. This writes one with the service role, but
 * only for an email that is a sourcing member and at most
 * FAILED_LOGIN_CAP_PER_HOUR per account, so it can't flood the log. The
 * response is the same either way, so it doesn't reveal which emails exist.
 */
async function recordFailedLogin(email: string): Promise<void> {
  const service = createServiceClient();
  const { data: member } = await service
    .from("members")
    .select("user_id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (!member) return;

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await service
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", member.user_id)
    .eq("action", "auth.login_failed")
    .gte("created_at", since);
  if ((count ?? 0) >= FAILED_LOGIN_CAP_PER_HOUR) return;

  await service.from("activity_log").insert({
    user_id: member.user_id,
    action: "auth.login_failed",
    entity_type: "auth",
    entity_id: member.user_id,
    description: "Failed sign-in attempt",
  });
}

/**
 * Records sign-in / sign-out / failed sign-in in the activity log. Password
 * sign-in happens in the browser, so the login page reports the outcome
 * here. Success and logout are only ever recorded for the session's own
 * user. The IP rate limit below adds a second cap on failed attempts.
 */
export const POST = withErrorHandling(async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid auth event." }, { status: 400 });
  }

  if (parsed.data.event === "login_failed") {
    await enforceRateLimit(`auth-failed:${clientIp(request)}`, 10, 60);
    await recordFailedLogin(parsed.data.email);
    return NextResponse.json({ ok: true });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Creates the membership on an invited user's first sign-in, so that
  // sign-in is logged too. One the app is about to reject (pending or
  // disabled) isn't logged as a successful sign-in.
  if (!user || !isActive(await ensureMember(supabase))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await logActivity(supabase, {
    userId: user.id,
    action: parsed.data.event === "login" ? "auth.login" : "auth.logout",
    entityType: "auth",
    entityId: user.id,
    description: parsed.data.event === "login" ? "Signed in" : "Signed out",
    metadata: parsed.data.event === "login" ? { method: "password" } : {},
  });

  return NextResponse.json({ ok: true });
});
