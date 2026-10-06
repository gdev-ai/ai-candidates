import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRole } from "@/lib/auth/roles";
import { withErrorHandling } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/service";
import { MAX_SEARCH_LIMIT } from "@/lib/usage/credits";
import { getCreditsSnapshot } from "@/lib/usage/snapshot";
import { tenantKey } from "@/lib/usage/tenant";

const limit = z.number().int().min(0).max(MAX_SEARCH_LIMIT);

const bodySchema = z
  .object({ daily: limit, weekly: limit, monthly: limit })
  .refine((l) => l.daily <= l.weekly && l.weekly <= l.monthly, {
    message: "Limits must grow from daily to weekly to monthly.",
  });

/** PUT /api/usage/limits (admins): sets the shared search limits. */
export const PUT = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid limits." },
      { status: 400 },
    );
  }

  const { error } = await createServiceClient().from("usage_limits").upsert({
    tenant_key: tenantKey(),
    daily_searches: parsed.data.daily,
    weekly_searches: parsed.data.weekly,
    monthly_searches: parsed.data.monthly,
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id,
  });
  if (error) {
    return NextResponse.json(
      { error: "Failed to save the limits." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ...(await getCreditsSnapshot()),
    canEditLimits: true,
  });
});
