-- HR Manager dashboard support.
--
-- 1. managed_user_ids(): the profiles an active hr_manager manages (everyone
--    in their own team, including themselves). SECURITY DEFINER so it can be
--    used inside RLS policies without recursive policy evaluation, and
--    set-returning so `x in (select public.managed_user_ids())` is evaluated
--    once per query rather than once per row.
-- 2. manager_select_team_* policies: a manager can read their team members'
--    sourcing data. Like the admin_select_* policies from 0007 this is
--    additive and redundant with 0001's `team_select_*` (using true) today —
--    it's what keeps manager visibility working once those blanket policies
--    are replaced by owner/team-scoped ones.
-- 3. team_sourcing_files(): the manager "sourcing files" table, one row per
--    search run owned by a team member, with per-file aggregates and all
--    filters applied in SQL. SECURITY INVOKER: RLS decides which teams and
--    runs a caller can see, so a manager passing another team's id gets
--    nothing back.

create or replace function public.managed_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $$
  select member.id
  from public.profiles manager
  join public.profiles member on member.team_id = manager.team_id
  where manager.id = auth.uid()
    and manager.role = 'hr_manager'
    and manager.is_active
    and manager.team_id is not null;
$$;

revoke execute on function public.managed_user_ids() from public, anon;
grant execute on function public.managed_user_ids() to authenticated;

create policy "manager_select_team_jobs" on public.jobs
  for select to authenticated
  using (user_id in (select public.managed_user_ids()));

create policy "manager_select_team_candidates" on public.candidates
  for select to authenticated
  using (user_id in (select public.managed_user_ids()));

create policy "manager_select_team_search_runs" on public.search_runs
  for select to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = search_runs.job_id and j.user_id in (select public.managed_user_ids())
  ));

create policy "manager_select_team_candidate_matches" on public.candidate_matches
  for select to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = candidate_matches.job_id and j.user_id in (select public.managed_user_ids())
  ));

create policy "manager_select_team_job_candidates" on public.job_candidates
  for select to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_candidates.job_id and j.user_id in (select public.managed_user_ids())
  ));

create policy "manager_select_team_search_queries" on public.search_queries
  for select to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = search_queries.job_id and j.user_id in (select public.managed_user_ids())
  ));

create policy "manager_select_team_search_run_access" on public.search_run_access
  for select to authenticated
  using (exists (
    select 1 from public.search_runs sr
    join public.jobs j on j.id = sr.job_id
    where sr.id = search_run_access.search_run_id
      and j.user_id in (select public.managed_user_ids())
  ));

create policy "manager_select_team_candidate_notes" on public.candidate_notes
  for select to authenticated
  using (exists (
    select 1 from public.candidates c
    where c.id = candidate_notes.candidate_id and c.user_id in (select public.managed_user_ids())
  ));

create policy "manager_select_team_candidate_status_history" on public.candidate_status_history
  for select to authenticated
  using (exists (
    select 1 from public.candidates c
    where c.id = candidate_status_history.candidate_id
      and c.user_id in (select public.managed_user_ids())
  ));

create index if not exists job_candidates_run_idx on public.job_candidates (search_run_id);
create index if not exists candidate_matches_run_idx on public.candidate_matches (search_run_id);
create index if not exists search_runs_job_idx on public.search_runs (job_id, created_at desc);
create index if not exists jobs_user_idx on public.jobs (user_id);

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
  with members as (
    select p.id, p.email
    from public.profiles p
    where p.team_id = p_team_id
      and (p_member_id is null or p.id = p_member_id)
  ),
  runs as (
    select sr.id, sr.job_id, sr.status, sr.created_at, sr.started_at, sr.completed_at,
      sr.created_by_email, j.title, j.user_id, m.email as owner_email
    from public.search_runs sr
    join public.jobs j on j.id = sr.job_id
    join members m on m.id = j.user_id
    where (p_status is null or sr.status = p_status)
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

revoke execute on function public.team_sourcing_files(uuid, uuid, text, text, timestamptz, timestamptz, integer, integer, integer) from public, anon;
grant execute on function public.team_sourcing_files(uuid, uuid, text, text, timestamptz, timestamptz, integer, integer, integer) to authenticated;
