import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { DB_SCHEMA } from "@/lib/supabase/types";
import type { Database } from "@/types/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database, typeof DB_SCHEMA>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: DB_SCHEMA },
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll is called from a Server Component; ignore when middleware
            // is refreshing the session instead.
          }
        },
      },
    },
  );
}
