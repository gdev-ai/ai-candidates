import { NextResponse } from "next/server";
import { z } from "zod";

import {
  announcementRequestSchema,
  toAnnouncementTag,
  type Announcement,
} from "@/lib/announcements/announcements";
import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";
import { createLogger } from "@/lib/logger";

const log = createLogger("api-announcements");

const LIMIT = 30;

/** GET: the latest announcements and when the caller last opened the feed. */
export const GET = withErrorHandling(async () => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const [list, read] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, title, body, tag, published_at, link, link_label")
      .order("published_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("announcement_reads")
      .select("seen_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (list.error || read.error) {
    log.error("Failed to load announcements", {
      error: list.error ?? read.error,
    });
    return NextResponse.json(
      { error: "Failed to load updates." },
      { status: 500 },
    );
  }

  const items: Announcement[] = (list.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    tag: toAnnouncementTag(row.tag),
    publishedAt: row.published_at,
    link: row.link,
    linkLabel: row.link_label,
  }));
  return NextResponse.json({ items, seenAt: read.data?.seen_at ?? null });
});

/** PATCH: the caller opened the feed; everything up to now counts as read. */
export const PATCH = withErrorHandling(async () => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const seenAt = new Date().toISOString();
  const { error } = await supabase
    .from("announcement_reads")
    .upsert({ user_id: user.id, seen_at: seenAt }, { onConflict: "user_id" });
  if (error) {
    log.error("Failed to mark announcements seen", { error });
    return NextResponse.json({ error: "Failed to update." }, { status: 500 });
  }
  return NextResponse.json({ seenAt });
});

/** POST (admins): publish { title, body?, tag }. */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user, member } = auth;
  if (member.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  const parsed = announcementRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid update." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("announcements")
    .insert({ ...parsed.data, created_by: user.id })
    .select("id")
    .single();
  if (error) {
    log.error("Failed to publish announcement", { error });
    return NextResponse.json(
      { error: "Failed to publish the update." },
      { status: 500 },
    );
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
});

/** DELETE (admins): /api/announcements?id=… removes one announcement. */
export const DELETE = withErrorHandling(async (request: Request) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, member } = auth;
  if (member.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.uuid().safeParse(id).success) {
    return NextResponse.json(
      { error: "A valid id query parameter is required." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) {
    log.error("Failed to delete announcement", { error });
    return NextResponse.json(
      { error: "Failed to delete the update." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
});
