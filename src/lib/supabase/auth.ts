import { createClient } from "@/lib/supabase/client";

export async function signInWithPassword(email: string, password: string) {
  const supabase = createClient();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(email: string, password: string) {
  const supabase = createClient();
  // The auth project is shared with HR Portal, whose Site URL is the default
  // confirmation target — send this app's confirmations back here instead.
  return supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
}

/**
 * Microsoft (Entra ID) sign-in. Supabase sends the user back to
 * /auth/callback, which exchanges the code and checks membership.
 */
export async function signInWithMicrosoft() {
  const supabase = createClient();
  return supabase.auth.signInWithOAuth({
    provider: "azure",
    // Azure only returns the email address when asked for it. The redirect
    // URL must have no query string: Supabase compares the whole URL with its
    // allow-list and silently falls back to the Site URL on a mismatch.
    options: {
      scopes: "email",
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
}

export async function signOut() {
  const supabase = createClient();
  return supabase.auth.signOut();
}

export type AuthEvent =
  | { event: "login" }
  | { event: "logout" }
  | { event: "login_failed"; email: string };

/** Best-effort: records the event in the activity log, never blocks or breaks sign-in. */
export async function reportAuthEvent(event: AuthEvent): Promise<void> {
  try {
    await fetch("/api/auth/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // Logging must never get in the way of signing in or out.
  }
}
