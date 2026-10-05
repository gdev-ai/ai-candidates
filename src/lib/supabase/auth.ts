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
