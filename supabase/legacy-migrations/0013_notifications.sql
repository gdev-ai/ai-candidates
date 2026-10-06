-- Manager notifications, built on the existing activity log rather than a
-- separate event system: a notification is just "this activity entry, for
-- this recipient, read or not". The text, actor and target all come from
-- the activity row, which the recipient can already read (a manager can
-- see their team's activity via manager_select_team_activity_log).
--
-- A trigger on activity_log fans notable events out to the actor's active
-- HR Manager(s):
--   * sourcing_run.started / completed / failed   (new file, finished, failed)
--   * candidate.status_changed to Shortlisted     (shortlist activity)
--   * job.candidates_scored with strongMatches > 0 (high-quality candidates)
-- Managers aren't notified about their own actions.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.activity_log(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, activity_id)
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (recipient_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "own_select_notifications" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

create policy "own_update_notifications" on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Rows are only ever created by the trigger below, and the only thing a
-- recipient may change is whether they've read it.
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.notify_team_manager()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not (
    new.action in ('sourcing_run.started', 'sourcing_run.completed', 'sourcing_run.failed')
    or (new.action = 'candidate.status_changed' and new.metadata->>'newStatus' = 'Shortlisted')
    or (
      new.action = 'job.candidates_scored'
      and coalesce(new.metadata->>'strongMatches', '') ~ '^[0-9]+$'
      and (new.metadata->>'strongMatches')::integer > 0
    )
  ) then
    return new;
  end if;

  insert into public.notifications (recipient_id, activity_id)
  select manager.id, new.id
  from public.profiles actor
  join public.profiles manager on manager.team_id = actor.team_id
  where actor.id = new.user_id
    and actor.team_id is not null
    and manager.role = 'hr_manager'
    and manager.is_active
    and manager.id <> new.user_id
  on conflict (recipient_id, activity_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.notify_team_manager() from public, anon, authenticated;

drop trigger if exists activity_log_notify_team_manager on public.activity_log;
create trigger activity_log_notify_team_manager
  after insert on public.activity_log
  for each row execute function public.notify_team_manager();
