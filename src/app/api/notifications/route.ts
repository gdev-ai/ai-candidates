import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";
import { loadNotifications } from "@/lib/notifications/notifications";

/** GET: the caller's latest notifications and unread count (RLS: own rows only). */
export const GET = withErrorHandling(async () => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const result = await loadNotifications(auth.supabase);
  if (result.error) {
    return NextResponse.json(
      { error: "Failed to load notifications." },
      { status: 500 },
    );
  }
  return NextResponse.json({ unread: result.unread, items: result.items });
});

const markReadSchema = z.object({
  /** Omit to mark everything read. */
  ids: z.array(z.string().uuid()).max(100).optional(),
});

/**
 * PATCH: mark notifications read. RLS restricts the update to the caller's
 * own rows, and column privileges restrict it to read_at, so ids belonging
 * to someone else are silently unaffected.
 */
export const PATCH = withErrorHandling(async (request: Request) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = markReadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ids must be a list of notification ids." },
      { status: 400 },
    );
  }

  let query = auth.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (parsed.data.ids) query = query.in("id", parsed.data.ids);

  const { error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to update notifications." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
});
