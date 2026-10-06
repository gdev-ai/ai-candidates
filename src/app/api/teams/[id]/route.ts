import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity/log";
import { requireRole } from "@/lib/auth/roles";
import { withErrorHandling } from "@/lib/errors";
import { parseUuid } from "@/lib/manager/filters";
import {
  assignTeamManager,
  InvalidManagerError,
} from "@/lib/teams/assignManager";
import { teamUpdateSchema } from "@/types/team";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH (admin): rename a team and/or change its manager. */
export const PATCH = withErrorHandling(
  async (request: Request, { params }: RouteParams) => {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return auth.error;
    const { user, supabase } = auth;
    const id = parseUuid((await params).id);
    if (!id)
      return NextResponse.json({ error: "Team not found." }, { status: 404 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const parsed = teamUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid team update." },
        { status: 400 },
      );
    }

    const { data: team, error: loadError } = await supabase
      .from("teams")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (loadError) {
      return NextResponse.json(
        { error: "Failed to load team." },
        { status: 500 },
      );
    }
    if (!team) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    if (parsed.data.name !== undefined) {
      const { error } = await supabase
        .from("teams")
        .update({ name: parsed.data.name })
        .eq("id", id);
      if (error) {
        return NextResponse.json(
          { error: "Failed to rename team." },
          { status: 500 },
        );
      }
    }

    if (parsed.data.managerId !== undefined) {
      try {
        await assignTeamManager(supabase, id, parsed.data.managerId);
      } catch (error) {
        if (error instanceof InvalidManagerError) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
    }

    await logActivity(supabase, {
      userId: user.id,
      action: "team.updated",
      entityType: "team",
      entityId: id,
      description: `Updated team "${parsed.data.name ?? team.name}"`,
      metadata: parsed.data,
    });

    return NextResponse.json({ ok: true });
  },
);
