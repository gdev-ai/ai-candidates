-- Job search versions and scoring batches.
--
-- A version is an exact snapshot of the job details and requirements a
-- search ran with. Each search (or scoring batch) records its version; when
-- the details changed since the last one, the app adds version N+1. A
-- candidate belongs to the version of the search that first found them
-- (job_candidates.search_run_id -> search_runs.job_version_id), and later
-- versions never re-add earlier candidates (job_candidates is keyed on
-- (job_id, person_id)).
--
-- A scoring batch ("Score 10 more" / "Score selected") is a search_runs row
-- with kind = 'score': it reads and AI-scores up to 10 people already on the
-- job, without a web search. It reuses the run's progress tracking and
-- counts against the shared search credits like a search.

create table sourcing.job_versions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references sourcing.jobs (id) on delete cascade,
  version int not null check (version >= 1),
  -- {title, description, company_id, employment_type, work_arrangement,
  --  seniority, city, country_code, min_experience, max_experience,
  --  requirements: [{kind, text}]}
  snapshot jsonb not null,
  created_by uuid references sourcing.members (user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_id, version)
);
create index job_versions_created_by_idx on sourcing.job_versions (created_by);

alter table sourcing.job_versions enable row level security;
-- Readable with the job; written only by the server (service role).
create policy job_versions_select on sourcing.job_versions
  for select to authenticated
  using (job_id in (select sourcing.visible_job_ids()));

alter table sourcing.search_runs
  add column job_version_id uuid references sourcing.job_versions (id) on delete set null,
  add column kind text not null default 'search' check (kind in ('search', 'score')),
  add column target_person_ids uuid[];
create index search_runs_job_version_idx on sourcing.search_runs (job_version_id);

alter table sourcing.match_results
  add column job_version_id uuid references sourcing.job_versions (id) on delete set null;
create index match_results_job_version_idx on sourcing.match_results (job_version_id);

-- Every existing job starts at version 1, from its current details; all its
-- runs and scores so far belong to it.
insert into sourcing.job_versions (job_id, version, snapshot, created_by, created_at)
select j.id, 1,
  jsonb_build_object(
    'title', j.title,
    'description', j.description,
    'company_id', j.company_id,
    'employment_type', j.employment_type,
    'work_arrangement', j.work_arrangement,
    'seniority', j.seniority,
    'city', j.city,
    'country_code', j.country_code,
    'min_experience', j.min_experience,
    'max_experience', j.max_experience,
    'requirements', coalesce((
      select jsonb_agg(jsonb_build_object('kind', r.kind, 'text', r.text)
                       order by r.sort_order, r.created_at)
        from sourcing.job_requirements r
       where r.job_id = j.id
    ), '[]'::jsonb)
  ),
  j.owner_id,
  coalesce((select min(r.created_at) from sourcing.search_runs r where r.job_id = j.id), j.created_at)
from sourcing.jobs j;

update sourcing.search_runs r
   set job_version_id = v.id
  from sourcing.job_versions v
 where v.job_id = r.job_id and v.version = 1 and r.job_version_id is null;

update sourcing.match_results m
   set job_version_id = v.id
  from sourcing.job_versions v
 where v.job_id = m.job_id and v.version = 1 and m.job_version_id is null;

-- Reports count searches only, not scoring batches.
CREATE OR REPLACE FUNCTION sourcing.user_performance_stats(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(user_id uuid, jobs_count bigint, runs_count bigint, completed_runs bigint, active_runs bigint, failed_runs bigint, candidates_count bigint, status_counts jsonb, run_avg_sum numeric, run_avg_count bigint, last_activity_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
    where r.kind = 'search'
      and (p_from is null or r.created_at >= p_from)
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
$function$;

CREATE OR REPLACE FUNCTION sourcing.sourcing_files(p_owner_ids uuid[] DEFAULT NULL::uuid[], p_status text DEFAULT NULL::text, p_job_title text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_min_match integer DEFAULT NULL::integer, p_min_candidates integer DEFAULT NULL::integer, p_limit integer DEFAULT 100)
 RETURNS TABLE(run_id uuid, job_id uuid, job_title text, sourcing_status text, owner_id uuid, owner_email text, owner_name text, created_by uuid, created_by_email text, created_by_name text, created_at timestamp with time zone, total_candidates bigint, shortlisted_candidates bigint, unseen_candidates bigint, average_match integer, last_accessed_by_id uuid, last_accessed_by_email text, last_accessed_by_name text, last_accessed_at timestamp with time zone, last_activity_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with runs as (
    select r.id, r.job_id, r.status, r.created_at, r.started_at, r.completed_at,
      r.created_by, j.title, j.owner_id
    from sourcing.search_runs r
    join sourcing.jobs j on j.id = r.job_id
    where r.kind = 'search'
      and (p_owner_ids is null or j.owner_id = any(p_owner_ids))
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
$function$;
