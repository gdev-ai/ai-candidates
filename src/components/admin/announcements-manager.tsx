"use client";

import { Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { sendAdminRequest } from "@/components/admin/admin-request";
import { TagPill } from "@/components/dashboard/whats-new";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  ANNOUNCEMENT_TAG_LABEL,
  ANNOUNCEMENT_TAGS,
  type Announcement,
  type AnnouncementTag,
} from "@/lib/announcements/announcements";
import { formatRelativeTime } from "@/lib/dates/formatRelativeTime";
import { cn } from "@/lib/utils";

export function AnnouncementsManager() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [tag, setTag] = useState<AnnouncementTag>("improved");
  const [isSaving, setIsSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/announcements", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: Announcement[] };
      setItems(data.items);
    } catch {
      setItems([]);
      toast.error("Updates couldn't be loaded.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    const ok = await sendAdminRequest("/api/announcements", "POST", {
      title: title.trim(),
      body: body.trim(),
      link: link.trim(),
      link_label: linkLabel.trim(),
      tag,
    });
    if (ok) {
      toast.success("Update published.");
      setTitle("");
      setBody("");
      setLink("");
      setLinkLabel("");
      await refresh();
    }
    setIsSaving(false);
  }

  async function handleDelete(item: Announcement) {
    const ok = await sendAdminRequest(
      `/api/announcements?id=${encodeURIComponent(item.id)}`,
      "DELETE",
      undefined,
    );
    if (ok) {
      setItems((current) => current?.filter((i) => i.id !== item.id) ?? null);
      toast.success("Update removed.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label="Type"
        >
          {ANNOUNCEMENT_TAGS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={tag === value}
              onClick={() => setTag(value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                tag === value
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {ANNOUNCEMENT_TAG_LABEL[value]}
            </button>
          ))}
        </div>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Candidate scores now explain each criterion"
          aria-label="Title"
          maxLength={120}
        />
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Optional details: what changed and how it helps"
          aria-label="Details"
          maxLength={2000}
          className="min-h-[96px]"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[3fr_2fr]">
          <Input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="Optional link, e.g. /candidates"
            aria-label="Link to a page in the app"
            maxLength={300}
          />
          <Input
            value={linkLabel}
            onChange={(event) => setLinkLabel(event.target.value)}
            placeholder="Link text, e.g. Open Candidates"
            aria-label="Link text"
            maxLength={40}
            disabled={!link.trim()}
          />
        </div>
        <div>
          <Button type="submit" size="sm" disabled={isSaving || !title.trim()}>
            <Send className="mr-1.5 h-4 w-4" />
            Publish to everyone
          </Button>
        </div>
      </form>

      <div>
        {items === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing posted yet. Updates appear in everyone&apos;s ✨ menu.
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <TagPill tag={item.tag} />
                    <span className="text-xs text-slate-500">
                      {formatRelativeTime(item.publishedAt)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-slate-900">
                    {item.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  aria-label={`Delete "${item.title}"`}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
