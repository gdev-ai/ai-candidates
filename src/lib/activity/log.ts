import { createLogger } from "@/lib/logger";
import type { SourcingClient } from "@/lib/supabase/types";
import type { Json } from "@/types/database.types";

/** Mirrors the activity_log.entity_type check constraint. */
export type ActivityEntityType = "auth" | "member" | "team" | "job" | "search_run" | "candidate" | "report";

export interface ActivityEvent {
  userId: string;
  action: string;
  entityType: ActivityEntityType;
  entityId?: string | null;
  description: string;
  metadata?: Record<string, Json | undefined>;
}

/**
 * Writes to the append-only activity_log (no update/delete policy exists on
 * that table, so this is the only way rows get in). Failures are logged and
 * swallowed rather than thrown — an audit-trail write must never fail the
 * user-facing action it's describing.
 */
export async function logActivity(
  supabase: SourcingClient,
  event: ActivityEvent,
): Promise<void> {
  const { error } = await supabase.from("activity_log").insert({
    user_id: event.userId,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    description: event.description,
    metadata: (event.metadata ?? {}) as Json,
  });

  if (error) {
    createLogger("activity-log").error("Failed to record activity", { error, event });
  }
}

/**
 * Like logActivity, but skips the write if the same user already logged the
 * same action on the same entity within `windowMs` — for events triggered
 * by page views, where a refresh shouldn't add another entry.
 */
export async function logActivityOnce(
  supabase: SourcingClient,
  event: ActivityEvent,
  windowMs: number,
): Promise<void> {
  const since = new Date(Date.now() - windowMs).toISOString();
  let query = supabase
    .from("activity_log")
    .select("id")
    .eq("user_id", event.userId)
    .eq("action", event.action)
    .gte("created_at", since)
    .limit(1);
  query = event.entityId ? query.eq("entity_id", event.entityId) : query.is("entity_id", null);

  const { data } = await query;
  if (data && data.length > 0) return;
  await logActivity(supabase, event);
}
