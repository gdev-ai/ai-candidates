-- "What's new" feed: fixes and improvements admins post for dashboard users.
--
-- Admins write announcements from the Admin page; every active member reads
-- them from the ✨ menu in the nav. announcement_reads keeps one row per
-- user with the last time they opened the feed, so anything published
-- after it shows as unread.

create table sourcing.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text check (char_length(body) <= 2000),
  tag text not null default 'improved' check (tag in ('new', 'improved', 'fix')),
  created_by uuid references sourcing.members (user_id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index announcements_published_idx on sourcing.announcements (published_at desc);
create index announcements_created_by_idx on sourcing.announcements (created_by);

create table sourcing.announcement_reads (
  user_id uuid primary key references sourcing.members (user_id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table sourcing.announcements enable row level security;
alter table sourcing.announcement_reads enable row level security;

create policy announcements_select on sourcing.announcements
  for select to authenticated
  using ((select sourcing.is_active_member()));
create policy announcements_insert on sourcing.announcements
  for insert to authenticated
  with check ((select sourcing.is_admin()) and created_by = (select auth.uid()));
create policy announcements_update on sourcing.announcements
  for update to authenticated
  using ((select sourcing.is_admin()))
  with check ((select sourcing.is_admin()));
create policy announcements_delete on sourcing.announcements
  for delete to authenticated
  using ((select sourcing.is_admin()));

create policy announcement_reads_select on sourcing.announcement_reads
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy announcement_reads_insert on sourcing.announcement_reads
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select sourcing.is_active_member()));
create policy announcement_reads_update on sourcing.announcement_reads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- Table grants come from the schema's default privileges.
