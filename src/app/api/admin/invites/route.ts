import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity/log";
import { ROLE_LABELS } from "@/lib/auth/roleDefinitions";
import { requireRole } from "@/lib/auth/roles";
import { withErrorHandling } from "@/lib/errors";
import { syncManagerAfterMemberChange } from "@/lib/teams/assignManager";
import { inviteSchema } from "@/types/team";

/**
 * POST (admin): give an email access to the app with a role and team.
 *  - Already an active member → 409.
 *  - A pending member (access request) or a disabled one → activated now
 *    with the given role/team.
 *  - Never signed in → saved in `invites`; sourcing.ensure_member() applies
 *    it (and grants access) on their first sign-in.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid invite." },
      { status: 400 },
    );
  }
  const { email, role } = parsed.data;
  const teamId = parsed.data.teamId ?? null;

  if (teamId) {
    const { data: team } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .maybeSingle();
    if (!team)
      return NextResponse.json({ error: "Team not found." }, { status: 400 });
  }

  // members.email is stored lowercase (check constraint), so eq is exact.
  const { data: existing, error: lookupError } = await supabase
    .from("members")
    .select("user_id, status")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json(
      { error: "Failed to look up the user." },
      { status: 500 },
    );
  }

  if (existing?.status === "active") {
    return NextResponse.json(
      { error: "This person already has access." },
      { status: 409 },
    );
  }

  if (existing) {
    const { data: member, error } = await supabase
      .from("members")
      .update({ status: "active", role, team_id: teamId })
      .eq("user_id", existing.user_id)
      .select("user_id, role, status, team_id")
      .single();
    if (error) {
      return NextResponse.json(
        { error: "Failed to grant access." },
        { status: 500 },
      );
    }
    await syncManagerAfterMemberChange(supabase, member);
    // A stale invite for the same email would otherwise linger in the list.
    await supabase.from("invites").delete().eq("email", email);
  } else {
    const { error } = await supabase
      .from("invites")
      .upsert(
        { email, role, team_id: teamId, invited_by: user.id },
        { onConflict: "email" },
      );
    if (error) {
      return NextResponse.json(
        { error: "Failed to save the invite." },
        { status: 500 },
      );
    }
  }

  await logActivity(supabase, {
    userId: user.id,
    action: existing ? "team.access_granted" : "team.user_invited",
    entityType: "member",
    entityId: existing?.user_id ?? null,
    description: existing
      ? `Granted ${email} access as ${ROLE_LABELS[role]}`
      : `Invited ${email} as ${ROLE_LABELS[role]}`,
    metadata: { email, role, teamId },
  });

  return NextResponse.json(
    { status: existing ? "activated" : "invited" },
    { status: existing ? 200 : 201 },
  );
});

/** DELETE (admin) ?email=…: withdraw an invite that hasn't been used yet. */
export const DELETE = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const parsed = inviteSchema.shape.email.safeParse(
    new URL(request.url).searchParams.get("email"),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid email is required." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("invites")
    .delete()
    .eq("email", parsed.data)
    .select("email");
  if (error) {
    return NextResponse.json(
      { error: "Failed to withdraw the invite." },
      { status: 500 },
    );
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  await logActivity(supabase, {
    userId: user.id,
    action: "team.invite_withdrawn",
    entityType: "member",
    description: `Withdrew the invite for ${parsed.data}`,
    metadata: { email: parsed.data },
  });

  return NextResponse.json({ ok: true });
});
