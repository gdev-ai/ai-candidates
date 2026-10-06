-- Team reporting + authentication activity.
--
-- 1. user_performance_stats(p_from, p_to): optional date window. Jobs, runs
--    and candidates count when they were *created* in the window; candidate
--    statuses are their current status. Called with no arguments it is
--    identical to the previous all-time version, so existing callers are
--    unaffected. last_activity_at stays all-time (it answers "when were
--    they last active", not "what happened in the window").
-- 2. activity_summary(p_from, p_to): per-user, per-action counts from the
--    activity log, for the Activity report. SECURITY INVOKER, so RLS limits
--    it to activity the caller may see.
-- 3. sourcing_files(p_owner_ids, ...): the per-file aggregate that
--    team_sourcing_files() used to compute inline, generalized to any set
--    of owners so the Sourcing Quality report also works org-wide (admins
--    belong to no team). team_sourcing_files() becomes a thin wrapper with
--    an unchanged signature and result.
-- 4. record_failed_login(p_email): failed sign-ins have no session, so they
--    can't be inserted under activity_log's own-row policy. This definer
--    function records one only for an email that belongs to a known
--    profile, and at most 10 per profile per hour, so it can't be used to
--    flood the log or to probe which emails exist (it always returns void).

drop function if exists public.user_performance_stats();

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

create or replace function public.activity_summary(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (user_id uuid, action text, event_count bigint, last_at timestamptz)
language sql
stable
security invoker
set search_path to ''
as $$
  select al.user_id, al.action, count(*), max(al.created_at)
  from public.activity_log al
  where al.user_id is not null
    and (p_from is null or al.created_at >= p_from)
    and (p_to is null or al.created_at < p_to)
  group by al.user_id, al.action;
$$;

revoke execute on function public.activity_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.activity_summary(timestamptz, timestamptz) to authenticated;

create or replace function public.sourcing_files(
  p_owner_ids uuid[],
  p_status text default null,
  p_job_title text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_min_match integer default null,
  p_min_candidates integer default null,
  p_limit integer default 100
)
returns table (
  run_id uuid,
  job_id uuid,
  job_title text,
  sourcing_status text,
  owner_id uuid,
  owner_email text,
  created_by_email text,
  created_at timestamptz,
  total_candidates bigint,
  shortlisted_candidates bigint,
  unseen_candidates bigint,
  average_match integer,
  last_accessed_by_email text,
  last_accessed_by_id uuid,
  last_activity_at timestamptz
)
language sql
stable
security invoker
set search_path to ''
as $$
  with runs as (
    select sr.id, sr.job_id, sr.status, sr.created_at, sr.started_at, sr.completed_at,
      sr.created_by_email, j.title, j.user_id, owner.email as owner_email
    from public.search_runs sr
    join public.jobs j on j.id = sr.job_id
    join public.profiles owner on owner.id = j.user_id
    where j.user_id = any(p_owner_ids)
      and (p_status is null or sr.status = p_status)
      and (p_job_title is null or j.title ilike '%' || p_job_title || '%')
      and (p_from is null or sr.created_at >= p_from)
      and (p_to is null or sr.created_at < p_to)
  ),
  linked as (
    select jc.search_run_id,
      count(*) as total,
      count(*) filter (where c.status = 'Shortlisted') as shortlisted,
      count(*) filter (where not exists (
        select 1 from public.candidate_views cv
        where cv.user_id = auth.uid() and cv.job_id = jc.job_id and cv.candidate_id = jc.candidate_id
      )) as unseen
    from public.job_candidates jc
    join public.candidates c on c.id = jc.candidate_id
    where jc.search_run_id in (select id from runs)
    group by jc.search_run_id
  ),
  scores as (
    select cm.search_run_id, round(avg(cm.match_score))::integer as average_match
    from public.candidate_matches cm
    where cm.search_run_id in (select id from runs)
    group by cm.search_run_id
  ),
  last_access as (
    select distinct on (sra.search_run_id)
      sra.search_run_id, sra.user_email, sra.user_id, sra.accessed_at
    from public.search_run_access sra
    where sra.search_run_id in (select id from runs)
    order by sra.search_run_id, sra.accessed_at desc
  )
  select
    r.id,
    r.job_id,
    r.title,
    r.status,
    r.user_id,
    r.owner_email,
    r.created_by_email,
    r.created_at,
    coalesce(l.total, 0),
    coalesce(l.shortlisted, 0),
    coalesce(l.unseen, 0),
    s.average_match,
    la.user_email,
    la.user_id,
    greatest(r.completed_at, r.started_at, r.created_at, la.accessed_at)
  from runs r
  left join linked l on l.search_run_id = r.id
  left join scores s on s.search_run_id = r.id
  left join last_access la on la.search_run_id = r.id
  where (p_min_match is null or s.average_match >= p_min_match)
    and (p_min_candidates is null or coalesce(l.total, 0) >= p_min_candidates)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke execute on function public.sourcing_files(uuid[], text, text, timestamptz, timestamptz, integer, integer, integer) from public, anon;
grant execute on function public.sourcing_files(uuid[], text, text, timestamptz, timestamptz, integer, integer, integer) to authenticated;

create or replace function public.team_sourcing_files(
  p_team_id uuid,
  p_member_id uuid default null,
  p_status text default null,
  p_job_title text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_min_match integer default null,
  p_min_candidates integer default null,
  p_limit integer default 100
)
returns table (
  run_id uuid,
  job_id uuid,
  job_title text,
  sourcing_status text,
  owner_id uuid,
  owner_email text,
  created_by_email text,
  created_at timestamptz,
  total_candidates bigint,
  shortlisted_candidates bigint,
  unseen_candidates bigint,
  average_match integer,
  last_accessed_by_email text,
  last_accessed_by_id uuid,
  last_activity_at timestamptz
)
language sql
stable
security invoker
set search_path to ''
as $$
  select * from public.sourcing_files(
    array(
      select p.id from public.profiles p
      where p.team_id = p_team_id and (p_member_id is null or p.id = p_member_id)
    ),
    p_status, p_job_title, p_from, p_to, p_min_match, p_min_candidates, p_limit
  );
$$;

create or replace function public.record_failed_login(p_email text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  target uuid;
begin
  select id into target
  from public.profiles
  where lower(email) = lower(trim(p_email))
  limit 1;

  if target is null then
    return;
  end if;

  if (
    select count(*) from public.activity_log
    where user_id = target
      and action = 'auth.login_failed'
      and created_at > now() - interval '1 hour'
  ) >= 10 then
    return;
  end if;

  insert into public.activity_log (user_id, action, entity_type, entity_id, description)
  values (target, 'auth.login_failed', 'auth', target, 'Had a failed sign-in attempt');
end;
$$;

revoke execute on function public.record_failed_login(text) from public;
grant execute on function public.record_failed_login(text) to anon, authenticated;
