"use client";

import { useState, type ReactNode } from "react";
import { X, Plus, GraduationCap, Briefcase, Tag, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OverflowTooltip } from "@/components/ui/overflow-tooltip";
import { cn } from "@/lib/utils";
import {
  CITIES,
  MISSING_FIELD_CLASS,
  REQUIREMENT_KIND_LABELS,
  SENIORITIES,
  SENIORITY_LABELS,
  type City,
  type RequirementInput,
  type RequirementKind,
  type RequirementsDraft,
  type Seniority,
} from "@/types/job";

// Radix Select can't use "" as an item value, so "not specified" is this
// sentinel in the dropdown and "" in the draft.
const UNSPECIFIED_VALUE = "unspecified";

interface RequirementsEditorProps {
  value: RequirementsDraft;
  onChange: (updated: RequirementsDraft) => void;
  /** Job detail fields (title, company, ...) shown at the top of the profile card. */
  children?: ReactNode;
}

/** Replaces one kind's rows, keeping the other kinds (and their order). */
export function replaceKind(
  requirements: RequirementInput[],
  kind: RequirementKind,
  texts: string[],
): RequirementInput[] {
  const others = requirements.filter((r) => r.kind !== kind);
  return [...others, ...texts.map((text) => ({ kind, text }))];
}

function textsOf(
  requirements: RequirementInput[],
  kind: RequirementKind,
): string[] {
  return requirements.filter((r) => r.kind === kind).map((r) => r.text);
}

type TabId = "skills" | "qualifications" | "overview";

const TABS: {
  id: TabId;
  label: string;
  icon: typeof Tag;
  kinds: {
    kind: RequirementKind;
    tone?: "good" | "warning";
    placeholder?: string;
  }[];
}[] = [
  {
    id: "skills",
    label: "Skills & Technologies",
    icon: Tag,
    kinds: [
      {
        kind: "skill_required",
        tone: "good",
        placeholder: "Add required skill (e.g. React)...",
      },
      {
        kind: "skill_preferred",
        tone: "warning",
        placeholder: "Add nice-to-have skill...",
      },
    ],
  },
  {
    id: "qualifications",
    label: "Education & Qualifications",
    icon: GraduationCap,
    kinds: [
      { kind: "education" },
      { kind: "certification" },
      { kind: "language" },
      { kind: "industry" },
    ],
  },
  {
    id: "overview",
    label: "Responsibilities & Keywords",
    icon: Briefcase,
    kinds: [{ kind: "responsibility" }, { kind: "keyword" }],
  },
];

function EditableList({
  label,
  items,
  onChangeItems,
  testId,
  placeholder,
  badgeTone = "neutral",
}: {
  label: string;
  items: string[];
  onChangeItems: (items: string[]) => void;
  testId: string;
  placeholder?: string;
  badgeTone?: "neutral" | "good" | "warning";
}) {
  const [draft, setDraft] = useState("");

  function addItem() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChangeItems([...items, trimmed]);
    setDraft("");
  }

  function removeItem(index: number) {
    onChangeItems(items.filter((_, i) => i !== index));
  }

  function editItem(index: number, newValue: string) {
    onChangeItems(items.map((item, i) => (i === index ? newValue : item)));
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">{label}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {items.length}
        </span>
      </div>

      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        data-testid={testId}
      >
        {items.map((item, index) => (
          <OverflowTooltip key={index} text={item} className="min-w-0">
            <div
              className={cn(
                "group flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 py-1 pl-2.5 pr-1.5 text-xs transition-all hover:bg-white hover:shadow-xs",
                badgeTone === "good" &&
                  "border-emerald-200 bg-emerald-50/60 text-emerald-950",
                badgeTone === "warning" &&
                  "border-amber-200 bg-amber-50/60 text-amber-950",
              )}
            >
              <input
                value={item}
                onChange={(e) => editItem(index, e.target.value)}
                data-testid={`${testId}-item-${index}`}
                data-overflow-target
                className="min-w-0 flex-1 truncate bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
                aria-label={`${label} item ${index + 1}`}
              />
              <button
                type="button"
                className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-700"
                aria-label={`Remove ${item}`}
                onClick={() => removeItem(index)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </OverflowTooltip>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 pt-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder || `Add ${label.toLowerCase()}...`}
          data-testid={`${testId}-add-input`}
          className="h-8 bg-slate-50/50 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          data-testid={`${testId}-add-button`}
          className="h-8 shrink-0 px-3 text-xs"
        >
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>
    </div>
  );
}

function parseYears(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Edits the AI-prefilled part of a job: any job detail fields passed as
 * children, then seniority, city, experience range and the requirement rows ({kind, text}) that become job_requirements.
 */
export function RequirementsEditor({
  value,
  onChange,
  children,
}: RequirementsEditorProps) {
  const [activeTab, setActiveTab] = useState<TabId>("skills");

  function update<K extends keyof RequirementsDraft>(
    field: K,
    fieldValue: RequirementsDraft[K],
  ) {
    onChange({ ...value, [field]: fieldValue });
  }

  const rangeInvalid =
    value.min_experience !== null &&
    value.max_experience !== null &&
    value.min_experience > value.max_experience;
  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0]!;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/80 via-white to-slate-50 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between border-b border-indigo-100/80 pb-3">
          <h3 className="text-sm font-semibold text-slate-900">Job Details</h3>
          <span className="flex items-center gap-1 rounded-full border border-indigo-200/60 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            Egypt
          </span>
        </div>

        {children && <div className="mb-4 flex flex-col gap-4">{children}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-semibold text-slate-700"
              htmlFor="ra-seniority"
            >
              Seniority
            </label>
            <Select
              value={value.seniority || UNSPECIFIED_VALUE}
              onValueChange={(v) =>
                update(
                  "seniority",
                  v === UNSPECIFIED_VALUE ? "" : (v as Seniority),
                )
              }
            >
              <SelectTrigger
                id="ra-seniority"
                className={cn(
                  "h-9 bg-white text-sm",
                  !value.seniority && MISSING_FIELD_CLASS,
                )}
                data-testid="ra-seniority"
              >
                <SelectValue placeholder="Select seniority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSPECIFIED_VALUE}>Not specified</SelectItem>
                {SENIORITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SENIORITY_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-semibold text-slate-700"
              htmlFor="ra-city"
            >
              City
            </label>
            <Select
              value={value.city || UNSPECIFIED_VALUE}
              onValueChange={(v) =>
                update("city", v === UNSPECIFIED_VALUE ? "" : (v as City))
              }
            >
              <SelectTrigger
                id="ra-city"
                className="h-9 bg-white text-sm"
                data-testid="ra-city"
              >
                <SelectValue placeholder="Select a city" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSPECIFIED_VALUE}>
                  Anywhere in Egypt
                </SelectItem>
                {CITIES.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-snug text-slate-500">
              Optional. Narrows the search to this city instead of all of Egypt.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-semibold text-slate-700"
              htmlFor="ra-min-exp"
            >
              Min Experience (Years)
            </label>
            <Input
              id="ra-min-exp"
              type="number"
              min={0}
              step={0.5}
              value={value.min_experience ?? ""}
              onChange={(e) =>
                update("min_experience", parseYears(e.target.value))
              }
              className={cn(
                "h-9 bg-white text-sm",
                value.min_experience === null && MISSING_FIELD_CLASS,
              )}
              aria-invalid={rangeInvalid}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-semibold text-slate-700"
              htmlFor="ra-max-exp"
            >
              Max Experience (Years)
            </label>
            <Input
              id="ra-max-exp"
              type="number"
              min={0}
              step={0.5}
              value={value.max_experience ?? ""}
              onChange={(e) =>
                update("max_experience", parseYears(e.target.value))
              }
              className={cn(
                "h-9 bg-white text-sm",
                value.max_experience === null && MISSING_FIELD_CLASS,
              )}
              aria-invalid={rangeInvalid}
            />
          </div>
        </div>
        {rangeInvalid && (
          <p role="alert" className="mt-2 text-xs font-medium text-red-600">
            Minimum experience can&apos;t be more than maximum.
          </p>
        )}
      </div>

      <div className="flex flex-wrap border-b border-slate-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count = t.kinds.reduce(
            (n, k) => n + textsOf(value.requirements, k.kind).length,
            0,
          );
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                activeTab === t.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tab.kinds.map(({ kind, tone, placeholder }) => (
          <EditableList
            key={kind}
            label={REQUIREMENT_KIND_LABELS[kind]}
            items={textsOf(value.requirements, kind)}
            onChangeItems={(items) =>
              update(
                "requirements",
                replaceKind(value.requirements, kind, items),
              )
            }
            testId={`requirements-${kind}`}
            badgeTone={tone}
            placeholder={placeholder}
          />
        ))}
      </div>
    </div>
  );
}
