import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";
import { createLogger } from "@/lib/logger";

const log = createLogger("api-companies");

/** Active HR Portal companies (public.companies), in their portal order. */
export const GET = withErrorHandling(async () => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .schema("public")
    .from("companies")
    .select("id, name")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    log.error("Failed to load companies", { error });
    return NextResponse.json({ error: "Failed to load companies." }, { status: 500 });
  }

  return NextResponse.json({ companies: data ?? [] });
});
