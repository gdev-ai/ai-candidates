import type { SourcingClient } from "@/lib/supabase/types";
import { getDisplayName } from "@/lib/users/displayName";
import type { Json } from "@/types/database.types";

export interface NotificationItem {
  id: string;
  read: boolean;
  createdAt: string;
  actorName: string;
  action: string;
  description: string;
  href: string;
}

export interface NotificationActivity {
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  metadata: Json | null;
}

function metadataString(metadata: Json | null, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

/** Where clicking a notification should take its recipient. */
export function notificationHref(activity: NotificationActivity): string {
  const jobId = metadataString(activity.metadata, "jobId");

  if (activity.action === "auth.access_requested") {
    return "/admin";
  }
  if (activity.entity_type === "search_run" && activity.entity_id && jobId) {
    return `/candidates?jobId=${jobId}&runId=${activity.entity_id}`;
  }
  if (activity.entity_type === "job" && activity.entity_id) {
    return `/candidates?jobId=${activity.entity_id}`;
  }
  // Candidates are global people; the pipeline (and its status) is per job.
  if (activity.entity_type === "candidate" && activity.entity_id) {
    return jobId
      ? `/candidates/${activity.entity_id}?jobId=${jobId}`
      : `/candidates/${activity.entity_id}`;
  }
  return activity.user_id ? `/manager/team/${activity.user_id}` : "/manager";
}

const LIST_LIMIT = 20;

/**
 * The caller's latest notifications plus their unread count. RLS limits
 * both to the caller's own rows; a notification whose activity the caller
 * can no longer read (e.g. the actor moved to another team) is dropped.
 */
export async function loadNotifications(
  supabase: SourcingClient,
): Promise<{ unread: number; items: NotificationItem[]; error: boolean }> {
  const [listRes, unreadRes] = await Promise.all([
    supabase
      .from("notifications")
      .select(
        "id, read_at, created_at, activity_log(user_id, action, entity_type, entity_id, description, metadata)",
      )
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  const rows = (listRes.data ?? []).flatMap((row) =>
    row.activity_log ? [{ ...row, activity: row.activity_log as NotificationActivity }] : [],
  );

  const actorIds = Array.from(
    new Set(rows.map((row) => row.activity.user_id).filter((id): id is string => id !== null)),
  );
  const { data: actors } = actorIds.length
    ? await supabase.from("members").select("user_id, email, full_name").in("user_id", actorIds)
    : { data: [] };
  const names = new Map(
    (actors ?? []).map((actor) => [actor.user_id, getDisplayName(actor.email, actor.full_name)]),
  );

  return {
    unread: unreadRes.count ?? 0,
    items: rows.map((row) => ({
      id: row.id,
      read: row.read_at !== null,
      createdAt: row.created_at,
      actorName: (row.activity.user_id ? names.get(row.activity.user_id) : null) ?? "A teammate",
      action: row.activity.action,
      description: row.activity.description,
      href: notificationHref(row.activity),
    })),
    error: Boolean(listRes.error || unreadRes.error),
  };
}
