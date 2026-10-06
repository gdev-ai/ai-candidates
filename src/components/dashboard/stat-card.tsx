import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  indigo: "from-indigo-500 to-indigo-700 shadow-indigo-500/35",
  sky: "from-sky-400 to-blue-600 shadow-sky-500/35",
  amber: "from-amber-400 to-amber-600 shadow-amber-500/35",
  emerald: "from-emerald-400 to-emerald-600 shadow-emerald-500/35",
} as const;

export type StatTone = keyof typeof TONE_CLASSES;

/**
 * Change against a previous period. `delta` is in the same unit as the
 * value (a count, or percentage points for a % metric). Set `invert` when a
 * drop is the good outcome.
 */
export type StatTrend = {
  delta: number;
  label?: string;
  unit?: string;
  invert?: boolean;
};

function TrendLine({ trend }: { trend: StatTrend }) {
  const { delta, label = "vs last week", unit = "", invert = false } = trend;
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const good = delta === 0 ? null : delta > 0 !== invert;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular-nums",
          good === null && "bg-slate-100 text-slate-600",
          good === true && "bg-emerald-50 text-emerald-700",
          good === false && "bg-red-50 text-red-700",
        )}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {sign}
        {Math.abs(delta)}
        {unit}
      </span>
      {label}
    </p>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "indigo",
  href,
  hint,
  trend,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: StatTone;
  href?: string;
  hint?: string;
  trend?: StatTrend;
}) {
  const card = (
    <Card
      className={cn("h-full transition-shadow hover:shadow-md", href && "hover:border-indigo-300")}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg",
            TONE_CLASSES[tone],
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="font-display text-3xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        {trend ? (
          <TrendLine trend={trend} />
        ) : (
          hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );

  if (!href) return card;
  return (
    <Link
      href={href}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      {card}
    </Link>
  );
}
