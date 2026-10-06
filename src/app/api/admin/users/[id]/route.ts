import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity/log";
import { requireRole } from "@/lib/auth/roles";
import { withErrorHandling } from "@/lib/errors";
import { parseUuid } from "@/lib/manager/filters";
import { syncManagerAfterMemberChange } from "@/lib/teams/assignManager";
import type { Update } from "@/lib/supabase/types";
import { memberUpdateSchema } from "@/types/team";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH (admin): change a member's role/team, or set their status to
 * active (approve / reactivate) or disabled. RLS (members_update: admin
 * only) enforces the same rule in the database.
 */
export const PATCH = withErrorHandling(
  async (request: Request, { params }: RouteParams) => {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return auth.error;
    const { user, supabase } = auth;
    const id = parseUuid((await params).id);
    if (!id)
      return NextResponse.json({ error: "User not found." }, { status: 404 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const parsed = memberUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid update." },
        { status: 400 },
      );
    }

    const updates: Update<"members"> = {};
    if (parsed.data.role !== undefined) updates.role = parsed.data.role;
    if (parsed.data.teamId !== undefined) updates.team_id = parsed.data.teamId;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No changes provided." },
        { status: 400 },
      );
    }

    // An admin removing their own admin role or disabling themselves could
    // leave nobody able to manage users; another admin must do it.
    const removesOwnAdmin =
      (updates.role !== undefined && updates.role !== "admin") ||
      updates.status === "disabled";
    if (id === user.id && removesOwnAdmin) {
      return NextResponse.json(
        { error: "You can't remove your own admin access. Ask another admin." },
        { status: 400 },
      );
    }

    if (updates.team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("id")
        .eq("id", updates.team_id)
        .maybeSingle();
      if (!team)
        return NextResponse.json({ error: "Team not found." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("members")
      .update(updates)
      .eq("user_id", id)
      .select("user_id, email, role, team_id, status")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to update user." },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    try {
      await syncManagerAfterMemberChange(supabase, data);
    } catch {
      return NextResponse.json(
        { error: "Failed to update team manager." },
        { status: 500 },
      );
    }

    await logActivity(supabase, {
      userId: user.id,
      action: "team.user_updated",
      entityType: "member",
      entityId: data.user_id,
      description: `Updated ${data.email}: ${Object.keys(updates).join(", ")}`,
      metadata: updates,
    });

    return NextResponse.json({
      member: {
        user_id: data.user_id,
        email: data.email,
        role: data.role,
        team_id: data.team_id,
        status: data.status,
      },
    });
  },
);
