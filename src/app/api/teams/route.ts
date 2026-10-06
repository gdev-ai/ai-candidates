import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity/log";
import { requireRole } from "@/lib/auth/roles";
import { withErrorHandling } from "@/lib/errors";
import {
  assignTeamManager,
  InvalidManagerError,
} from "@/lib/teams/assignManager";
import { teamCreateSchema } from "@/types/team";

/** POST (admin): create a team, optionally with its manager. */
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

  const parsed = teamCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid team data." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("teams")
    .insert({ name: parsed.data.name })
    .select("id, name, manager_id, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create team." },
      { status: 500 },
    );
  }

  await logActivity(supabase, {
    userId: user.id,
    action: "team.created",
    entityType: "team",
    entityId: data.id,
    description: `Created team "${data.name}"`,
  });

  if (parsed.data.managerId) {
    try {
      await assignTeamManager(supabase, data.id, parsed.data.managerId);
    } catch (managerError) {
      if (managerError instanceof InvalidManagerError) {
        return NextResponse.json(
          { error: `Team created, but ${managerError.message.toLowerCase()}` },
          { status: 400 },
        );
      }
      throw managerError;
    }
    data.manager_id = parsed.data.managerId;
  }

  return NextResponse.json({ team: data }, { status: 201 });
});
