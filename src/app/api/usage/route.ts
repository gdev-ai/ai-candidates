import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";
import { getCreditsSnapshot } from "@/lib/usage/snapshot";

/**
 * GET /api/usage → the search credits shared by everyone on these API
 * keys: daily / weekly / monthly searches used and left, spend, and the
 * providers' own remaining quota. Same answer for every signed-in user.
 */
export const GET = withErrorHandling(async () => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const snapshot = await getCreditsSnapshot();
  return NextResponse.json({
    ...snapshot,
    canEditLimits: auth.member.role === "admin",
  });
});
