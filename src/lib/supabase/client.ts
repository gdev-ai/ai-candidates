import { createBrowserClient } from "@supabase/ssr";

import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { DB_SCHEMA } from "@/lib/supabase/types";
import type { Database } from "@/types/database.types";

export function createClient() {
  return createBrowserClient<Database, typeof DB_SCHEMA>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: DB_SCHEMA }, cookieOptions: authCookieOptions },
  );
}
