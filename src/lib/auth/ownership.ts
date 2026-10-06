import { NextResponse } from "next/server";

import type { SourcingClient } from "@/lib/supabase/types";
import { getDisplayName } from "@/lib/users/displayName";

/**
 * What the UI needs to render a record the caller may be viewing on someone
 * else's behalf (e.g. a manager opening a team member's file): whether to
 * show edit controls, and whose record it is. Display only — the write
 * routes enforce ownership themselves.
 */
export async function describeOwnership(
  supabase: SourcingClient,
  ownerId: string,
  userId: string,
): Promise<{ can_edit: boolean; owner_name: string | null }> {
  if (ownerId === userId) return { can_edit: true, owner_name: null };
  const { data } = await supabase
    .from("members")
    .select("email, full_name")
    .eq("user_id", ownerId)
    .maybeSingle();
  return { can_edit: false, owner_name: getDisplayName(data?.email, data?.full_name) };
}

/**
 * Managers and admins can read their team's / everyone's records, but
 * writes stay owner-only (RLS enforces that too). Checking up front turns a
 * write that would fail deep inside a handler — often after paid search or
 * AI calls — into an immediate, clear 403.
 */
export function forbidUnlessOwner(
  ownerId: string | null | undefined,
  userId: string,
  what: string,
): NextResponse | null {
  if (ownerId === userId) return null;
  return NextResponse.json(
    { error: `You can view this ${what}, but only its owner can change it.` },
    { status: 403 },
  );
}
