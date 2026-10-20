"use client";

import {
  ArrowRight,
  MessageCircle,
  Sparkles,
  TrendingUp,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ANNOUNCEMENT_TAG_LABEL,
  announcementLinkLabel,
  supportWhatsAppUrl,
  type Announcement,
  type AnnouncementTag,
} from "@/lib/announcements/announcements";
import { formatRelativeTime } from "@/lib/dates/formatRelativeTime";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const POLL_MS = 5 * 60_000;
const SUPPORT_NUDGE_KEY = "support-nudge-dismissed";
const NEWS_NUDGE_KEY = "news-nudge-dismissed";
const NUDGE_DELAY_MS = 3_000;
const NUDGE_VISIBLE_MS = 8_000;

// The news and support nudges take turns so their bubbles never overlap.
// Each claims the next free slot; news claims as soon as its data loads,
// support only when its own timer fires, so news usually goes first.
let nudgeSlotFreeAt = 0;
function claimNudgeSlot(earliest: number): number {
  const start = Math.max(earliest, nudgeSlotFreeAt);
  nudgeSlotFreeAt = start + NUDGE_VISIBLE_MS + 500;
  return start;
}

function alreadyNudged(key: string): boolean {
  try {
    return sessionStorage.getItem(key) !== null;
  } catch {
    return false; // Storage blocked: still nudge, just without remembering it.
  }
}

function rememberNudged(key: string) {
  try {
    sessionStorage.setItem(key, "1");
  } catch {}
}

/** Hides a nudge after it has been visible for a while. */
function useAutoHide(visible: boolean, hide: () => void) {
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(hide, NUDGE_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [visible, hide]);
}

function NudgeBubble({
  children,
  onDismiss,
  role = "status",
  label,
  tone = "light",
}: {
  children: ReactNode;
  onDismiss: () => void;
  role?: "status" | "dialog";
  label?: string;
  /** "dark" stands out against the white UI. */
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div
      role={role}
      aria-label={label}
      className={cn(
        "animate-nudge-in absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border p-3 pr-8",
        dark
          ? "border-slate-800 bg-slate-900 text-white shadow-xl shadow-slate-900/25"
          : "border-slate-200 bg-white shadow-lg",
      )}
    >
      <span
        className={cn(
          "absolute -top-1.5 right-3 h-3 w-3 rotate-45 border-l border-t",
          dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white",
        )}
        aria-hidden="true"
      />
      {children}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className={cn(
          "absolute right-2 top-2 rounded p-0.5 transition-colors",
          dark
            ? "text-slate-400 hover:bg-white/10 hover:text-white"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
        )}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export const TAG_CLASSES: Record<AnnouncementTag, string> = {
  new: "bg-slate-900 text-white ring-slate-900",
  improved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  fix: "bg-amber-50 text-amber-700 ring-amber-200",
};

export function TagPill({ tag }: { tag: AnnouncementTag }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        TAG_CLASSES[tag],
      )}
    >
      {ANNOUNCEMENT_TAG_LABEL[tag]}
    </span>
  );
}

function useSignedInEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setEmail(data.session?.user.email ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return email;
}

/**
 * Support icon: opens a short explainer whose button starts a WhatsApp chat
 * (prefilled with who and where), so nobody lands in WhatsApp by surprise.
 */
export function SupportLink() {
  const pathname = usePathname();
  const email = useSignedInEmail();
  // "nudge": shown by the timer, hides itself; "open": the user clicked, stays.
  const [mode, setMode] = useState<"nudge" | "open" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setMode(null), []);
  useAutoHide(mode === "nudge", close);
  // × (or using the chat) stops the nudge for the rest of the session;
  // auto-hide, Esc and outside clicks only close it on this page.
  const dismiss = useCallback(() => {
    rememberNudged(SUPPORT_NUDGE_KEY);
    setMode(null);
  }, []);

  // On every page, 3s after landing (or after the news nudge), wiggle and
  // ask, until dismissed for this session.
  useEffect(() => {
    if (alreadyNudged(SUPPORT_NUDGE_KEY)) return;
    let show: number | undefined;
    const wait = window.setTimeout(() => {
      const delay = Math.max(0, claimNudgeSlot(Date.now()) - Date.now());
      show = window.setTimeout(() => {
        setMode((current) => current ?? "nudge");
      }, delay);
    }, NUDGE_DELAY_MS);
    return () => {
      window.clearTimeout(wait);
      window.clearTimeout(show);
    };
  }, []);

  useEffect(() => {
    if (!mode) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mode, close]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() =>
          setMode((current) => (current === "open" ? null : "open"))
        }
        aria-haspopup="dialog"
        aria-expanded={mode !== null}
        aria-label="Help and support"
        title="Help and support"
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          mode
            ? "bg-[#25D366] text-slate-900"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        {mode === "nudge" && (
          <span
            className="absolute inset-0 rounded-full bg-[#25D366]/60 motion-safe:animate-ping"
            aria-hidden="true"
          />
        )}
        <MessageCircle
          className={cn(
            "relative h-5 w-5",
            mode === "nudge" && "animate-wiggle",
          )}
          aria-hidden="true"
        />
      </button>

      {mode && (
        <NudgeBubble
          onDismiss={dismiss}
          role={mode === "open" ? "dialog" : "status"}
          label="Help and support"
          tone="dark"
        >
          <p className="text-sm font-semibold text-white">Need help?</p>
          <p className="mt-0.5 text-sm text-slate-300">
            Questions, bugs or ideas? Chat with the AI & Developments team on
            WhatsApp.
          </p>
          <a
            href={supportWhatsAppUrl({ email, path: pathname })}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-[#1ebe5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Chat on WhatsApp
          </a>
        </NudgeBubble>
      )}
    </div>
  );
}

const TAG_ICON: Record<AnnouncementTag, LucideIcon> = {
  new: Sparkles,
  improved: TrendingUp,
  fix: Wrench,
};

// Brand palette: black for New, the success and warning hues for the rest.
const TAG_ICON_CLASSES: Record<AnnouncementTag, string> = {
  new: "bg-slate-900 text-white",
  improved: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  fix: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
};

function FeedItem({
  item,
  fresh,
  onNavigate,
}: {
  item: Announcement;
  fresh: boolean;
  onNavigate: () => void;
}) {
  const Icon = TAG_ICON[item.tag];
  const content = (
    <>
      {fresh && (
        <span
          className="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-slate-900"
          aria-hidden="true"
        />
      )}
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          TAG_ICON_CLASSES[item.tag],
        )}
        aria-hidden="true"
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-snug text-slate-900">
          {item.title}
        </span>
        <span className="mt-0.5 block text-[11px] text-slate-500">
          {ANNOUNCEMENT_TAG_LABEL[item.tag]} ·{" "}
          {formatRelativeTime(item.publishedAt)}
          {fresh && <span className="sr-only"> · unread</span>}
        </span>
        {item.body && (
          <span className="mt-1.5 block whitespace-pre-line text-[13px] leading-relaxed text-slate-600">
            {item.body}
          </span>
        )}
        {item.link && (
          <span className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-900 transition-colors group-hover:border-slate-900 group-hover:bg-slate-900 group-hover:text-white">
            {announcementLinkLabel(item)}
            <ArrowRight
              className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        )}
      </span>
    </>
  );
  const rowClass = "relative flex gap-3 px-4 py-3.5";
  return (
    <li>
      {item.link ? (
        <Link
          href={item.link}
          onClick={onNavigate}
          className={cn(
            rowClass,
            "group transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none",
          )}
        >
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  );
}

function FeedSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="bg-slate-50 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <ul className="divide-y divide-slate-100">{children}</ul>
    </div>
  );
}

/** "What's new" feed, with a WhatsApp support chat link at the bottom. */
export function WhatsNew() {
  const pathname = usePathname();
  const email = useSignedInEmail();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Announcement[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Captured when the panel opens, so items stay highlighted while it's open.
  const [highlightSince, setHighlightSince] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mountedAt = useRef(0);
  const [nudging, setNudging] = useState(false);
  const stopNudging = useCallback(() => setNudging(false), []);
  useAutoHide(nudging, stopNudging);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/announcements", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        items: Announcement[];
        seenAt: string | null;
      };
      setItems(data.items);
      setSeenAt(data.seenAt);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    mountedAt.current = Date.now();
    refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

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

  const isUnread = (item: Announcement, since: string | null) =>
    !since || new Date(item.publishedAt) > new Date(since);
  const unread = items.filter((item) => isUnread(item, seenAt)).length;
  const latest = unread > 0 ? (items[0] ?? null) : null;
  const dismissKey = latest ? `${NEWS_NUDGE_KEY}:${latest.id}` : null;

  // Unread news: on every page, 3s after landing, wiggle and show the newest
  // title, until × is clicked (for that post) or the feed is opened. Shares
  // the nudge slots with support, so the two never overlap.
  useEffect(() => {
    if (!dismissKey || alreadyNudged(dismissKey)) return;
    const start = claimNudgeSlot(mountedAt.current + NUDGE_DELAY_MS);
    const show = window.setTimeout(
      () => setNudging(true),
      Math.max(0, start - Date.now()),
    );
    return () => window.clearTimeout(show);
  }, [dismissKey]);

  const dismissNudge = useCallback(() => {
    if (dismissKey) rememberNudged(dismissKey);
    setNudging(false);
  }, [dismissKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    setNudging(false);
    if (!next) return;
    setHighlightSince(seenAt);
    if (unread > 0) {
      setSeenAt(new Date().toISOString());
      void fetch("/api/announcements", { method: "PATCH" }).catch(
        () => undefined,
      );
    }
  }

  const freshItems = items.filter((item) => isUnread(item, highlightSince));
  const earlierItems = items.filter((item) => !isUnread(item, highlightSince));
  const close = () => setOpen(false);
  const showNudge = nudging && !open && latest !== null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread > 0 ? `What's new, ${unread} unread` : "What's new"}
        title="What's new"
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          showNudge
            ? "bg-slate-900 text-white"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        {showNudge && (
          <span
            className="absolute inset-0 rounded-full bg-slate-900/40 motion-safe:animate-ping"
            aria-hidden="true"
          />
        )}
        <Sparkles
          className={cn("relative h-5 w-5", showNudge && "animate-wiggle")}
          aria-hidden="true"
        />
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none tabular-nums text-white ring-2 ring-background"
            aria-hidden="true"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {showNudge && latest && (
        <NudgeBubble onDismiss={dismissNudge} tone="dark" label="What's new">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {unread > 1 ? `${unread} new updates` : "New update"}
          </p>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-white">
            {latest.title}
          </p>
          <button
            type="button"
            onClick={toggle}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            See what&apos;s new
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </NudgeBubble>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="What's new"
          className="absolute right-0 z-20 mt-2 w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
            <div>
              <p className="font-display text-base font-semibold text-slate-900">
                What&apos;s new
              </p>
              <p className="text-xs text-slate-500">
                Fixes and improvements to Sourcing
              </p>
            </div>
            {freshItems.length > 0 && (
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                {freshItems.length} new
              </span>
            )}
          </div>

          {loadFailed && items.length === 0 ? (
            <p className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-500">
              Updates couldn&apos;t be loaded. Try again shortly.
            </p>
          ) : items.length === 0 ? (
            <p className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-500">
              No updates yet. Fixes and new features will be posted here.
            </p>
          ) : (
            <div className="max-h-[26rem] overflow-y-auto border-t border-slate-100">
              {freshItems.length > 0 && (
                <FeedSection label="New for you">
                  {freshItems.map((item) => (
                    <FeedItem
                      key={item.id}
                      item={item}
                      fresh
                      onNavigate={close}
                    />
                  ))}
                </FeedSection>
              )}
              {earlierItems.length > 0 && (
                <FeedSection
                  label={freshItems.length > 0 ? "Earlier" : "All updates"}
                >
                  {earlierItems.map((item) => (
                    <FeedItem
                      key={item.id}
                      item={item}
                      fresh={false}
                      onNavigate={close}
                    />
                  ))}
                </FeedSection>
              )}
            </div>
          )}

          <a
            href={supportWhatsAppUrl({ email, path: pathname })}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 transition-colors hover:bg-slate-100"
          >
            <MessageCircle
              className="h-3.5 w-3.5 text-emerald-600"
              aria-hidden="true"
            />
            Something not working?
            <span className="font-semibold text-slate-900">
              Chat with us on WhatsApp
            </span>
          </a>
        </div>
      )}
    </div>
  );
}
