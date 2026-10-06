import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { ensureMember } from "@/lib/auth/access";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { DB_SCHEMA } from "@/lib/supabase/types";
import type { Database } from "@/types/database.types";

const PROTECTED_PREFIXES = ["/dashboard", "/jobs", "/candidates", "/settings", "/admin", "/manager", "/reports"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database, typeof DB_SCHEMA>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: DB_SCHEMA },
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Access is an active membership. The first visit creates it (pending
  // unless an admin invited the email), and disabling someone in Admin
  // takes effect here on their next page load.
  if (isProtected && user) {
    const member = await ensureMember(supabase);
    if (member?.status !== "active") {
      await supabase.auth.signOut();
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", member?.status === "pending" ? "pending_approval" : "not_allowed");
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // .well-known/workflow/ is Vercel Workflows' internal step endpoint.
    "/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/).*)",
  ],
};
