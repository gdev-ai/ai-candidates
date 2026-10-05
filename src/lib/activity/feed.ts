import { getDisplayName } from "@/lib/users/displayName";

export const ACTIVITY_FEED_COLUMNS = "id, user_id, action, entity_type, description, created_at";

export interface ActivityLogRow {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  description: string;
  created_at: string;
}

export interface ActivityFeedItem {
  id: string;
  actorName: string;
  action: string;
  description: string;
  createdAt: string;
}

export interface ActorInfo {
  email: string;
  full_name: string | null;
}

export function toActivityFeedItems(
  rows: ActivityLogRow[],
  actorsById: Map<string, ActorInfo>,
): ActivityFeedItem[] {
  return rows.map((row) => {
    const actor = row.user_id ? actorsById.get(row.user_id) : undefined;
    return {
      id: row.id,
      actorName: getDisplayName(actor?.email, actor?.full_name) ?? "Unknown user",
      action: row.action,
      description: row.description,
      createdAt: row.created_at,
    };
  });
}
