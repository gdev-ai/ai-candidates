"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { Brandmark } from "@/components/brand/brandmark";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { SearchRunWatcher } from "@/components/dashboard/search-run-watcher";
import { SupportLink, WhatsNew } from "@/components/dashboard/whats-new";
import { CreditsMeter } from "@/components/usage/CreditsMeter";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/candidates", label: "Candidates" },
];

// Optional: the link is hidden when unset (local dev). Trailing slash tolerated.
const HR_PORTAL_URL = process.env.NEXT_PUBLIC_HR_PORTAL_URL?.trim().replace(
  /\/+$/,
  "",
);

// Only decides which role links to show; /manager, /admin and their APIs
// re-check the role server-side. Cached per signed-in user so client-side
// navigation doesn't re-query on every page, while a sign-in, sign-out or
// account switch in the same tab gets a fresh answer. An empty answer is
// never cached: right after login the lookup can run before the session is
// attached, and caching that would hide the links until a full reload.
const roleCache = new Map<string, Promise<string | null>>();

async function fetchRole(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user.id;
  if (!userId) return null;

  let pending = roleCache.get(userId);
  if (!pending) {
    pending = Promise.resolve(supabase.rpc("my_role")).then(
      ({ data, error }) => (!error && typeof data === "string" ? data : null),
      () => null,
    );
    roleCache.set(userId, pending);
    void pending.then((role) => {
      if (role === null) roleCache.delete(userId);
    });
  }
  return pending;
}

export function DashboardNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchRole().then((result) => {
        if (!cancelled) setRole(result);
      });

    // Fires once immediately (INITIAL_SESSION) and again on sign-in/out and
    // token refresh. Deferred because supabase-js warns against awaiting
    // its own calls inside this callback.
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange(() => {
      setTimeout(load, 0);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <SearchRunWatcher />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-3 py-4 text-foreground"
          aria-label="G Developments candidate sourcing, home"
        >
          <Brandmark className="h-4" />
          <span className="border-l border-border pl-3 text-xs font-medium text-muted-foreground">
            Sourcing
          </span>
        </Link>
        {/* flex-1 + justify-center: links sit centered in the space between brand and actions. */}
        <nav className="flex flex-1 flex-wrap items-center justify-center gap-x-8">
          {LINKS.map((link) => {
            const isActive =
              link.href === "/dashboard"
                ? pathname === link.href
                : pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative py-4 text-[13px] transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:origin-left after:bg-foreground after:transition-transform after:duration-200",
                  isActive
                    ? "font-medium text-foreground after:scale-x-100"
                    : "text-muted-foreground after:scale-x-0 hover:text-foreground hover:after:scale-x-100",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          {role && <CreditsMeter />}
          {role && <WhatsNew />}
          {role && <SupportLink />}
          {(role === "hr_manager" || role === "admin") && <NotificationBell />}
          <AccountMenu role={role} />
          {HR_PORTAL_URL && (
            <a
              href={`${HR_PORTAL_URL}/admin`}
              className="px-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to HR Portal
            </a>
          )}
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
