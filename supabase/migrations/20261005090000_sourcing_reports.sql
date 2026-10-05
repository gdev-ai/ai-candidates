-- Report and dashboard functions for the `sourcing` schema
-- (replaces the old public.user_performance_stats / activity_summary /
-- sourcing_files / team_sourcing_files / profile_last_sign_ins).
--
-- Model notes
--   * A candidate's pipeline status lives on job_candidates (per job), and
--     people are global, so "a user's candidates" are the job_candidates
--     rows of the jobs that user owns.
--   * All but member_last_sign_ins are SECURITY INVOKER: RLS bounds every
--     row they read to what the caller may see (visible_owner_ids). The
--     p_user_ids / p_owner_ids filters are applied before any aggregation.
--   * Execute is granted to authenticated only; the schema's default
--     privileges already withhold it from public/anon.

-- Per-user totals. Candidate statuses come back as a jsonb object
-- ({"New": 3, "Shortlisted": 1, ...}) so a new status needs no migration.
-- Counts cover jobs / runs / candidates created (found) in [p_from, p_to);
-- run_avg_sum / run_avg_count let callers combine "average of per-run
-- average match scores" across any grouping without re-reading rows.
create or replace function sourcing.user_performance_stats(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_user_ids uuid[] default null
)
returns table (
  user_id uuid,
  jobs_count bigint,
  runs_count bigint,
  completed_runs bigint,
  active_runs bigint,
  failed_runs bigint,
  candidates_count bigint,
  status_counts jsonb,
  run_avg_sum numeric,
  run_avg_count bigint,
  last_activity_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with scoped_members as (
    select m.user_id
    from sourcing.members m
    where p_user_ids is null or m.user_id = any(p_user_ids)
  ),
  scoped_jobs as (
    select j.id, j.owner_id, j.created_at
    from sourcing.jobs j
    where j.owner_id in (select sm.user_id from scoped_members sm)
  ),
  job_stats as (
    select sj.owner_id, count(*) as jobs_count, max(sj.created_at) as last_at
    from scoped_jobs sj
    where (p_from is null or sj.created_at >= p_from)
      and (p_to is null or sj.created_at < p_to)
    group by sj.owner_id
  ),
  scoped_runs as (
    select r.id, sj.owner_id, r.status, r.created_at
    from sourcing.search_runs r
    join scoped_jobs sj on sj.id = r.job_id
    where (p_from is null or r.created_at >= p_from)
      and (p_to is null or r.created_at < p_to)
  ),
  run_stats as (
    select sr.owner_id,
      count(*) as runs_count,
      count(*) filter (where sr.status = 'complete') as completed_runs,
      count(*) filter (where sr.status in ('pending', 'running')) as active_runs,
      count(*) filter (where sr.status = 'error') as failed_runs,
      max(sr.created_at) as last_at
    from scoped_runs sr
    group by sr.owner_id
  ),
  scoped_candidates as (
    select sj.owner_id, jc.status, jc.found_at, jc.status_changed_at
    from sourcing.job_candidates jc
    join scoped_jobs sj on sj.id = jc.job_id
    where (p_from is null or jc.found_at >= p_from)
      and (p_to is null or jc.found_at < p_to)
  ),
  status_stats as (
    select sc.owner_id, sc.status, count(*) as n,
      max(greatest(sc.found_at, sc.status_changed_at)) as last_at
    from scoped_candidates sc
    group by sc.owner_id, sc.status
  ),
  candidate_stats as (
    select ss.owner_id,
      sum(ss.n)::bigint as candidates_count,
      jsonb_object_agg(ss.status, ss.n) as status_counts,
      max(ss.last_at) as last_at
    from status_stats ss
    group by ss.owner_id
  ),
  run_averages as (
    select sr.owner_id, avg(jc.match_score) as run_avg
    from scoped_runs sr
    join sourcing.job_candidates jc on jc.search_run_id = sr.id
    where jc.match_score is not null
    group by sr.owner_id, sr.id
  ),
  match_stats as (
    select ra.owner_id, sum(ra.run_avg) as run_avg_sum, count(*) as run_avg_count
    from run_averages ra
    group by ra.owner_id
  ),
  activity_stats as (
    select al.user_id, max(al.created_at) as last_at
    from sourcing.activity_log al
    where al.user_id in (select sm.user_id from scoped_members sm)
    group by al.user_id
  ),
  access_stats as (
    select a.user_id, max(a.last_accessed_at) as last_at
    from sourcing.search_run_access a
    where a.user_id in (select sm.user_id from scoped_members sm)
    group by a.user_id
  )
  select
    sm.user_id,
    coalesce(js.jobs_count, 0),
    coalesce(rs.runs_count, 0),
    coalesce(rs.completed_runs, 0),
    coalesce(rs.active_runs, 0),
    coalesce(rs.failed_runs, 0),
    coalesce(cs.candidates_count, 0),
    coalesce(cs.status_counts, '{}'::jsonb),
    coalesce(ms.run_avg_sum, 0),
    coalesce(ms.run_avg_count, 0),
    greatest(js.last_at, rs.last_at, cs.last_at, act.last_at, acc.last_at)
  from scoped_members sm
  left join job_stats js on js.owner_id = sm.user_id
  left join run_stats rs on rs.owner_id = sm.user_id
  left join candidate_stats cs on cs.owner_id = sm.user_id
  left join match_stats ms on ms.owner_id = sm.user_id
  left join activity_stats act on act.user_id = sm.user_id
  left join access_stats acc on acc.user_id = sm.user_id;
$$;

-- Activity-log event counts per user and action in [p_from, p_to).
create or replace function sourcing.activity_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_user_ids uuid[] default null
)
returns table (user_id uuid, action text, event_count bigint, last_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select al.user_id, al.action, count(*), max(al.created_at)
  from sourcing.activity_log al
  where al.user_id is not null
    and (p_user_ids is null or al.user_id = any(p_user_ids))
    and (p_from is null or al.created_at >= p_from)
    and (p_to is null or al.created_at < p_to)
  group by al.user_id, al.action;
$$;

-- One row per sourcing file (search run) the caller can see, newest first.
-- p_owner_ids null = every visible owner. "Unseen" is relative to the
-- caller (no candidate_views row of theirs); "last accessed" comes from
-- search_run_access. Names of members the caller can't see come back null.
create or replace function sourcing.sourcing_files(
  p_owner_ids uuid[] default null,
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
  owner_name text,
  created_by uuid,
  created_by_email text,
  created_by_name text,
  created_at timestamptz,
  total_candidates bigint,
  shortlisted_candidates bigint,
  unseen_candidates bigint,
  average_match integer,
  last_accessed_by_id uuid,
  last_accessed_by_email text,
  last_accessed_by_name text,
  last_accessed_at timestamptz,
  last_activity_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with runs as (
    select r.id, r.job_id, r.status, r.created_at, r.started_at, r.completed_at,
      r.created_by, j.title, j.owner_id
    from sourcing.search_runs r
    join sourcing.jobs j on j.id = r.job_id
    where (p_owner_ids is null or j.owner_id = any(p_owner_ids))
      and (p_status is null or r.status = p_status)
      and (p_job_title is null or strpos(lower(j.title), lower(p_job_title)) > 0)
      and (p_from is null or r.created_at >= p_from)
      and (p_to is null or r.created_at < p_to)
  ),
  linked as (
    select jc.search_run_id,
      count(*) as total,
      count(*) filter (where jc.status = 'Shortlisted') as shortlisted,
      count(*) filter (where not exists (
        select 1 from sourcing.candidate_views cv
        where cv.user_id = (select auth.uid())
          and cv.job_id = jc.job_id
          and cv.person_id = jc.person_id
      )) as unseen,
      round(avg(jc.match_score))::integer as average_match,
      max(jc.status_changed_at) as last_status_at
    from sourcing.job_candidates jc
    where jc.search_run_id in (select runs.id from runs)
    group by jc.search_run_id
  ),
  last_access as (
    select distinct on (a.search_run_id) a.search_run_id, a.user_id, a.last_accessed_at
    from sourcing.search_run_access a
    where a.search_run_id in (select runs.id from runs)
    order by a.search_run_id, a.last_accessed_at desc
  )
  select
    r.id,
    r.job_id,
    r.title,
    r.status,
    r.owner_id,
    o.email,
    o.full_name,
    r.created_by,
    c.email,
    c.full_name,
    r.created_at,
    coalesce(l.total, 0),
    coalesce(l.shortlisted, 0),
    coalesce(l.unseen, 0),
    l.average_match,
    la.user_id,
    acc.email,
    acc.full_name,
    la.last_accessed_at,
    greatest(r.completed_at, r.started_at, r.created_at, la.last_accessed_at, l.last_status_at)
  from runs r
  left join linked l on l.search_run_id = r.id
  left join last_access la on la.search_run_id = r.id
  left join sourcing.members o on o.user_id = r.owner_id
  left join sourcing.members c on c.user_id = r.created_by
  left join sourcing.members acc on acc.user_id = la.user_id
  where (p_min_match is null or l.average_match >= p_min_match)
    and (p_min_candidates is null or coalesce(l.total, 0) >= p_min_candidates)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- Last sign-in per member, for members the caller can see. SECURITY
-- DEFINER because auth.users isn't readable by authenticated; it exposes
-- only these two columns, scoped by visible_owner_ids().
create or replace function sourcing.member_last_sign_ins()
returns table (user_id uuid, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.last_sign_in_at
  from auth.users u
  where u.id in (select sourcing.visible_owner_ids());
$$;

grant execute on function
  sourcing.user_performance_stats(timestamptz, timestamptz, uuid[]),
  sourcing.activity_summary(timestamptz, timestamptz, uuid[]),
  sourcing.sourcing_files(uuid[], text, text, timestamptz, timestamptz, integer, integer, integer),
  sourcing.member_last_sign_ins()
to authenticated;

-- Part B (run by hand in the SQL editor; the MCP connector declines REVOKE).
-- PUBLIC still holds EXECUTE on every sourcing function: the schema's
-- "alter default privileges ... revoke execute on functions from public"
-- doesn't override the global default. anon has no USAGE on the schema,
-- so nothing is reachable today; this just makes the grants explicit.
--
-- revoke execute on function
--   sourcing.user_performance_stats(timestamptz, timestamptz, uuid[]),
--   sourcing.activity_summary(timestamptz, timestamptz, uuid[]),
--   sourcing.sourcing_files(uuid[], text, text, timestamptz, timestamptz, integer, integer, integer),
--   sourcing.member_last_sign_ins()
-- from public, anon;
