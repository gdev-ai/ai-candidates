-- 1. "Hired" pipeline status. The app has offered Hired in the status
--    dropdown and pipeline chart, but the candidates.status check
--    constraint never allowed it, so choosing it failed. This allows it
--    and adds hired_count to user_performance_stats() so dashboards and
--    reports count it.
-- 2. Admin notifications for access requests. An uninvited sign-up now
--    records an `auth.access_requested` activity entry, and the activity
--    notification trigger (generalized from notify_team_manager) notifies
--    every active admin about it, linking to the Admin dashboard.

alter table public.candidates drop constraint if exists candidates_status_check;
alter table public.candidates add constraint candidates_status_check
  check (status = any (array['New', 'Reviewed', 'Shortlisted', 'Rejected', 'Contacted', 'Hired']));

drop function if exists public.user_performance_stats(timestamptz, timestamptz);

create function public.user_performance_stats(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  user_id uuid,
  jobs_count bigint,
  runs_count bigint,
  completed_runs bigint,
  active_runs bigint,
  failed_runs bigint,
  candidates_count bigint,
  new_count bigint,
  reviewed_count bigint,
  shortlisted_count bigint,
  contacted_count bigint,
  rejected_count bigint,
  hired_count bigint,
  run_avg_sum numeric,
  run_avg_count bigint,
  last_activity_at timestamptz
)
language sql
stable
security invoker
set search_path to ''
as $$
  with job_stats as (
    select j.user_id, count(*) as jobs_count, max(j.created_at) as last_job_at
    from public.jobs j
    where (p_from is null or j.created_at >= p_from)
      and (p_to is null or j.created_at < p_to)
    group by j.user_id
  ),
  run_stats as (
    select j.user_id,
      count(*) as runs_count,
      count(*) filter (where sr.status = 'complete') as completed_runs,
      count(*) filter (where sr.status in ('pending', 'running')) as active_runs,
      count(*) filter (where sr.status = 'error') as failed_runs,
      max(sr.created_at) as last_run_at
    from public.search_runs sr
    join public.jobs j on j.id = sr.job_id
    where (p_from is null or sr.created_at >= p_from)
      and (p_to is null or sr.created_at < p_to)
    group by j.user_id
  ),
  candidate_stats as (
    select c.user_id,
      count(*) as candidates_count,
      count(*) filter (where c.status = 'New') as new_count,
      count(*) filter (where c.status = 'Reviewed') as reviewed_count,
      count(*) filter (where c.status = 'Shortlisted') as shortlisted_count,
      count(*) filter (where c.status = 'Contacted') as contacted_count,
      count(*) filter (where c.status = 'Rejected') as rejected_count,
      count(*) filter (where c.status = 'Hired') as hired_count,
      max(c.updated_at) as last_candidate_at
    from public.candidates c
    where (p_from is null or c.created_at >= p_from)
      and (p_to is null or c.created_at < p_to)
    group by c.user_id
  ),
  run_averages as (
    select j.user_id, avg(cm.match_score) as run_avg
    from public.candidate_matches cm
    join public.search_runs sr on sr.id = cm.search_run_id
    join public.jobs j on j.id = sr.job_id
    where (p_from is null or sr.created_at >= p_from)
      and (p_to is null or sr.created_at < p_to)
    group by j.user_id, cm.search_run_id
  ),
  match_stats as (
    select ra.user_id, sum(ra.run_avg) as run_avg_sum, count(*) as run_avg_count
    from run_averages ra
    group by ra.user_id
  ),
  activity_stats as (
    select al.user_id, max(al.created_at) as last_logged_at
    from public.activity_log al
    group by al.user_id
  ),
  access_stats as (
    select sra.user_id, max(sra.accessed_at) as last_access_at
    from public.search_run_access sra
    group by sra.user_id
  )
  select
    p.id,
    coalesce(js.jobs_count, 0),
    coalesce(rs.runs_count, 0),
    coalesce(rs.completed_runs, 0),
    coalesce(rs.active_runs, 0),
    coalesce(rs.failed_runs, 0),
    coalesce(cs.candidates_count, 0),
    coalesce(cs.new_count, 0),
    coalesce(cs.reviewed_count, 0),
    coalesce(cs.shortlisted_count, 0),
    coalesce(cs.contacted_count, 0),
    coalesce(cs.rejected_count, 0),
    coalesce(cs.hired_count, 0),
    coalesce(ms.run_avg_sum, 0),
    coalesce(ms.run_avg_count, 0),
    greatest(js.last_job_at, rs.last_run_at, cs.last_candidate_at, act.last_logged_at, acc.last_access_at)
  from public.profiles p
  left join job_stats js on js.user_id = p.id
  left join run_stats rs on rs.user_id = p.id
  left join candidate_stats cs on cs.user_id = p.id
  left join match_stats ms on ms.user_id = p.id
  left join activity_stats act on act.user_id = p.id
  left join access_stats acc on acc.user_id = p.id;
$$;

revoke execute on function public.user_performance_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.user_performance_stats(timestamptz, timestamptz) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  pending public.pending_role_assignments%rowtype;
begin
  select * into pending
  from public.pending_role_assignments
  where email = lower(new.email);

  insert into public.profiles (id, email, role, team_id, is_active)
  values (
    new.id,
    new.email,
    coalesce(pending.role, 'hr_user'),
    pending.team_id,
    pending.email is not null
  )
  on conflict (id) do nothing;

  if pending.email is null then
    -- Uninvited: surfaces to admins as an access request (and notifies them).
    insert into public.activity_log (user_id, action, entity_type, entity_id, description, metadata)
    values (new.id, 'auth.access_requested', 'profile', new.id,
            'Requested access to the app', jsonb_build_object('email', new.email));
  end if;

  if pending.role = 'hr_manager' and pending.team_id is not null then
    update public.teams set manager_id = new.id where id = pending.team_id;
  end if;

  if pending.email is not null then
    delete from public.pending_role_assignments where email = pending.email;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.notify_on_activity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.action = 'auth.access_requested' then
    insert into public.notifications (recipient_id, activity_id)
    select admin.id, new.id
    from public.profiles admin
    where admin.role = 'admin' and admin.is_active and admin.id <> new.user_id
    on conflict (recipient_id, activity_id) do nothing;
    return new;
  end if;

  if not (
    new.action in ('sourcing_run.started', 'sourcing_run.completed', 'sourcing_run.failed')
    or (new.action = 'candidate.status_changed' and new.metadata->>'newStatus' in ('Shortlisted', 'Hired'))
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

revoke execute on function public.notify_on_activity() from public, anon, authenticated;

drop trigger if exists activity_log_notify_team_manager on public.activity_log;
drop trigger if exists activity_log_notify on public.activity_log;
create trigger activity_log_notify
  after insert on public.activity_log
  for each row execute function public.notify_on_activity();

drop function if exists public.notify_team_manager();
