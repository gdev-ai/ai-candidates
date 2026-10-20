"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Brandmark } from "@/components/brand/brandmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  reportAuthEvent,
  signInWithMicrosoft,
  signInWithPassword,
} from "@/lib/supabase/auth";

const NOT_ALLOWED_MESSAGE =
  "Your account doesn't have access. Ask an admin to invite you.";
const PENDING_MESSAGE =
  "Your access request has been sent. An admin needs to approve it before you can sign in.";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Which sign-in is in flight. Stays set through the redirect to the
  // dashboard, so the button keeps showing progress until the page changes.
  const [pending, setPending] = useState<"password" | "microsoft" | null>(null);
  const isSubmitting = pending !== null;
  // Until the page is interactive, a click would submit the form natively
  // instead of through handleSubmit, so the buttons stay disabled.
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  // A native submit from an older build put credentials in the query string;
  // drop them from the address bar and this history entry.
  useEffect(() => {
    if (searchParams.has("password") || searchParams.has("email")) {
      router.replace("/login");
    }
  }, [searchParams, router]);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "not_allowed") {
      setError(NOT_ALLOWED_MESSAGE);
    } else if (errorParam === "pending_approval") {
      setMessage(PENDING_MESSAGE);
    } else if (errorParam === "link_failed") {
      // `detail` is the provider's own reason (e.g. Microsoft returned no
      // email); shown as text, never as markup.
      const detail = searchParams.get("detail");
      setError(
        detail
          ? `Sign-in failed: ${detail.slice(0, 300)}`
          : "That sign-in link is invalid or has expired. Please log in again.",
      );
    }
  }, [searchParams]);

  async function handleMicrosoft() {
    setError(null);
    setMessage(null);
    setPending("microsoft");
    const { error: authError } = await signInWithMicrosoft();
    // On success the browser is already navigating to Microsoft.
    if (authError) {
      setPending(null);
      setError(authError.message);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPending("password");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const { error: authError } = await signInWithPassword(email, password);

    if (authError) {
      setPending(null);
      setError(authError.message);
      reportAuthEvent({ event: "login_failed", email });
      return;
    }

    // Fire-and-forget: a client-side navigation doesn't cancel the request.
    void reportAuthEvent({ event: "login" });
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-black p-4 text-white">
      <Card className="animate-page-enter w-full max-w-sm border-white/20">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>
            Use your HR Portal email and password, or sign in with Microsoft.
          </CardDescription>
        </CardHeader>
        {/* method="post": even a native submit never puts the password in the URL. */}
        <form method="post" onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-4">
            <Input
              type="email"
              name="email"
              placeholder="Email"
              required
              autoComplete="email"
            />
            <Input
              type="password"
              name="password"
              placeholder="Password"
              required
              minLength={6}
              autoComplete="current-password"
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="text-sm text-muted-foreground">
                {message}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!isReady || isSubmitting}
              onClick={handleMicrosoft}
            >
              {pending === "microsoft" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Redirecting to Microsoft…
                </>
              ) : (
                "Sign in with Microsoft"
              )}
            </Button>
            <Button
              type="submit"
              className="w-full"
              disabled={!isReady || isSubmitting}
            >
              {pending === "password" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Signing you in…
                </>
              ) : (
                "Log in"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
      <div className="absolute bottom-8 left-8 hidden sm:block">
        <Brandmark className="h-6 text-white" />
        <p className="mt-3 text-xs text-[#BFBFBF]">Candidate sourcing</p>
      </div>
    </main>
  );
}
