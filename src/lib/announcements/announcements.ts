import { z } from "zod";

export const ANNOUNCEMENT_TAGS = ["new", "improved", "fix"] as const;
export type AnnouncementTag = (typeof ANNOUNCEMENT_TAGS)[number];

export const ANNOUNCEMENT_TAG_LABEL: Record<AnnouncementTag, string> = {
  new: "New",
  improved: "Improved",
  fix: "Fix",
};

export type Announcement = {
  id: string;
  title: string;
  body: string | null;
  tag: AnnouncementTag;
  publishedAt: string;
  /** In-app path the update points to, e.g. "/candidates". */
  link: string | null;
  linkLabel: string | null;
};

/** Internal paths only: one leading slash, not "//host" or "/\host". */
const INTERNAL_PATH = /^\/([^/\\]|$)/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);

export const announcementRequestSchema = z
  .object({
    title: z.string().trim().min(1, "A title is required.").max(120),
    body: optionalText(2000),
    tag: z.enum(ANNOUNCEMENT_TAGS).default("improved"),
    link: optionalText(300).refine(
      (value) => !value || INTERNAL_PATH.test(value),
      {
        message:
          "The link must be a page in this app, starting with / (e.g. /candidates).",
      },
    ),
    link_label: optionalText(40),
  })
  .transform((value) => ({
    ...value,
    // A label without a link means nothing.
    link_label: value.link ? value.link_label : null,
  }));

/** Call-to-action text for a linked update. */
export function announcementLinkLabel(item: Pick<Announcement, "linkLabel">) {
  return item.linkLabel || "Take a look";
}

export function toAnnouncementTag(value: string): AnnouncementTag {
  return (ANNOUNCEMENT_TAGS as readonly string[]).includes(value)
    ? (value as AnnouncementTag)
    : "improved";
}

/** wa.me wants digits only (country code first, no + or spaces). */
export const SUPPORT_WHATSAPP =
  (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "") ||
  "201099359799";

export function supportWhatsAppUrl(context: {
  email?: string | null;
  path?: string | null;
}) {
  const lines = ["Hi, I need help with Sourcing."];
  if (context.email) lines.push(`Account: ${context.email}`);
  if (context.path) lines.push(`Page: ${context.path}`);
  lines.push("", "");
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;
}
