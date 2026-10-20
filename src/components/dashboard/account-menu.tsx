"use client";

import {
  BarChart3,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type MenuLink = { href: string; label: string; icon: LucideIcon };

const ACCOUNT_LINK: MenuLink = {
  href: "/settings",
  label: "Account settings",
  icon: Settings,
};
const REPORTS_LINK: MenuLink = {
  href: "/reports",
  label: "Reports",
  icon: BarChart3,
};
const TEAM_LINK: MenuLink = { href: "/manager", label: "Team", icon: Users };
const ADMIN_LINK: MenuLink = {
  href: "/admin",
  label: "Admin",
  icon: ShieldCheck,
};

function linksFor(role: string | null): MenuLink[] {
  if (role === "admin")
    return [REPORTS_LINK, TEAM_LINK, ADMIN_LINK, ACCOUNT_LINK];
  if (role === "hr_manager") return [REPORTS_LINK, TEAM_LINK, ACCOUNT_LINK];
  return [REPORTS_LINK, ACCOUNT_LINK];
}

/** Profile icon dropdown. Role links are only shown; their pages re-check the role. */
export function AccountMenu({ role }: { role: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const links = linksFor(role);
  const isActive = (href: string) => Boolean(pathname?.startsWith(href));
  const anyActive = links.some((link) => isActive(link.href));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title="Account"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          anyActive
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <UserCircle className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              aria-current={isActive(href) ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors hover:bg-slate-50",
                isActive(href)
                  ? "font-medium text-slate-900"
                  : "text-slate-700",
                href === ACCOUNT_LINK.href &&
                  "mt-1 border-t border-slate-100 pt-2.5",
              )}
            >
              <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
