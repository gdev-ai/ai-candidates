"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Clicks on these keep their own behaviour instead of opening the row.
 * Mark anything else with data-row-click-ignore.
 */
const INTERACTIVE = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role=button]",
  "[role=checkbox]",
  "[role=combobox]",
  "[role=dialog]",
  "[role=menuitem]",
  "[contenteditable=true]",
  "[data-row-click-ignore]",
].join(",");

/**
 * A table row that opens `href` when clicked anywhere that isn't already a
 * control. Ctrl/⌘/Shift-click and middle-click open a new tab, and selecting
 * text doesn't navigate. Rows aren't tab stops: each row keeps a real link
 * for keyboard and screen-reader users.
 */
export function ClickableRow({
  href,
  className,
  onClick,
  onAuxClick,
  onMouseEnter,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { href: string }) {
  const router = useRouter();

  function shouldIgnore(e: React.MouseEvent<HTMLTableRowElement>): boolean {
    if (e.defaultPrevented) return true;
    const target = e.target as Element;
    // React bubbles events out of portals (select menus, dialogs) too.
    if (!e.currentTarget.contains(target)) return true;
    const control = target.closest(INTERACTIVE);
    if (control && e.currentTarget.contains(control)) return true;
    return Boolean(window.getSelection()?.toString());
  }

  return (
    <tr
      {...props}
      className={cn("cursor-pointer", className)}
      onClick={(e) => {
        onClick?.(e);
        if (shouldIgnore(e)) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          window.open(href, "_blank", "noopener");
          return;
        }
        router.push(href);
      }}
      onAuxClick={(e) => {
        onAuxClick?.(e);
        if (e.button !== 1 || shouldIgnore(e)) return;
        window.open(href, "_blank", "noopener");
      }}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        router.prefetch(href);
      }}
    />
  );
}
