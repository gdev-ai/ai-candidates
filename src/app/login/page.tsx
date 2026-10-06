"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
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
  signUpWithPassword,
} from "@/lib/supabase/auth";

type Mode = "login" | "signup";

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
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "not_allowed") {
      setError(NOT_ALLOWED_MESSAGE);
    } else if (errorParam === "pending_approval") {
      setMessage(PENDING_MESSAGE);
    } else if (errorParam === "link_failed") {
      setError(
        "That sign-in link is invalid or has expired. Please log in again.",
      );
    }
  }, [searchParams]);

  async function handleMicrosoft() {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    const { error: authError } = await signInWithMicrosoft(
      searchParams.get("redirectTo"),
    );
    // On success the browser is already navigating to Microsoft.
    if (authError) {
      setIsSubmitting(false);
      setError(authError.message);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const { error: authError } =
      mode === "login"
        ? await signInWithPassword(email, password)
        : await signUpWithPassword(email, password);

    setIsSubmitting(false);

    if (authError) {
      setError(authError.message);
      if (mode === "login") reportAuthEvent({ event: "login_failed", email });
      return;
    }

    if (mode === "signup") {
      setMessage(
        "Account created. Check your email to confirm, then log in. If you weren't invited, an admin will need to approve your access first.",
      );
      return;
    }

    await reportAuthEvent({ event: "login" });
    router.push("/");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-black p-4 text-white">
      <Card className="animate-page-enter w-full max-w-sm border-white/20">
        <CardHeader>
          <CardTitle>{mode === "login" ? "Log in" : "Sign up"}</CardTitle>
          <CardDescription>
            {mode === "login"
              ? "Use your HR Portal email and password."
              : "Create an account to get started."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
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
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
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
              disabled={isSubmitting}
              onClick={handleMicrosoft}
            >
              Sign in with Microsoft
            </Button>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting
                ? "Please wait..."
                : mode === "login"
                  ? "Log in"
                  : "Sign up"}
            </Button>
            <Button
              type="button"
              variant="link"
              className="w-full"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError(null);
                setMessage(null);
              }}
            >
              {mode === "login"
                ? "Need an account? Sign up"
                : "Already have an account? Log in"}
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
