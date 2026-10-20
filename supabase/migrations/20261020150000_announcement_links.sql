-- Optional in-app link on an announcement ("Open Candidates →"). Internal
-- paths only (a single leading slash), so a post can't send people off-site.

alter table sourcing.announcements
  add column link text check (
    link is null or (link ~ '^/([^/\\]|$)' and char_length(link) <= 300)
  ),
  add column link_label text check (char_length(link_label) <= 40);
