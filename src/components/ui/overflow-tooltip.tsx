"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Wraps a single-line, truncating element and, on hover, shows `text` in a
 * tooltip above it — but only when the element's content is actually cut
 * off. The truncating element is found via `[data-overflow-target]` inside
 * the wrapper (falls back to the first child).
 */
export function OverflowTooltip({
  text,
  children,
  className,
}: {
  text: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  function handleEnter(e: React.MouseEvent<HTMLDivElement>) {
    const el =
      e.currentTarget.querySelector<HTMLElement>("[data-overflow-target]") ??
      (e.currentTarget.firstElementChild as HTMLElement | null);
    if (el && el.scrollWidth > el.clientWidth) setOpen(true);
  }

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        // Outer box centres on the anchor; the inner one animates, so the
        // keyframe transform doesn't fight the centring translate.
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2">
          <div
            role="tooltip"
            className="animate-tooltip-in relative w-max max-w-xs rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium leading-snug text-white shadow-lg"
          >
            {text}
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
          </div>
        </div>
      )}
    </div>
  );
}
