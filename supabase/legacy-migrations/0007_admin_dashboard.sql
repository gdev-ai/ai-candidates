-- Admin dashboard support.
--
-- 1. admin_select_* policies: admins can read every row of the sourcing
--    data tables. Today this is redundant with migration 0001's
--    `team_select_*` (using true) policies, so nobody's access changes; it
--    exists so admin visibility keeps working once those blanket policies
--    are replaced with team-scoped ones.
-- 2. user_performance_stats(): per-user aggregates (jobs, runs, candidate
--    pipeline, match quality, last activity) computed in Postgres so the
--    dashboard never pulls every candidate row just to count it. SECURITY
--    INVOKER, so RLS still decides which rows each caller aggregates over.
-- 3. profile_last_sign_ins(): auth.users.last_sign_in_at is not readable by
--    the authenticated role, so this SECURITY DEFINER function exposes it
--    only for profiles the caller is allowed to see (self, own team if
--    hr_manager, everyone if admin).

create policy "admin_select_jobs" on public.jobs
  for select to authenticated using (public.is_admin());
create policy "admin_select_candidates" on public.candidates
  for select to authenticated using (public.is_admin());
create policy "admin_select_search_runs" on public.search_runs
  for select to authenticated using (public.is_admin());
create policy "admin_select_candidate_matches" on public.candidate_matches
  for select to authenticated using (public.is_admin());
create policy "admin_select_job_candidates" on public.job_candidates
  for select to authenticated using (public.is_admin());
create policy "admin_select_search_queries" on public.search_queries
  for select to authenticated using (public.is_admin());
create policy "admin_select_candidate_notes" on public.candidate_notes
  for select to authenticated using (public.is_admin());
create policy "admin_select_candidate_status_history" on public.candidate_status_history
  for select to authenticated using (public.is_admin());
create policy "admin_select_search_run_access" on public.search_run_access
  for select to authenticated using (public.is_admin());
create policy "admin_select_candidate_views" on public.candidate_views
  for select to authenticated using (public.is_admin());

create index if not exists search_run_access_user_idx
  on public.search_run_access (user_id, accessed_at desc);
create index if not exists candidates_user_status_idx
  on public.candidates (user_id, status);

create or replace function public.user_performance_stats()
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
    group by c.user_id
  ),
  -- Same per-file averaging the main dashboard uses: average each run's
  -- scores, then average those per-run averages (sum/count returned so
  -- org/team totals can be combined correctly).
  run_averages as (
    select j.user_id, avg(cm.match_score) as run_avg
    from public.candidate_matches cm
    join public.search_runs sr on sr.id = cm.search_run_id
    join public.jobs j on j.id = sr.job_id
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

create or replace function public.profile_last_sign_ins()
returns table (user_id uuid, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select u.id, u.last_sign_in_at
  from auth.users u
  join public.profiles p on p.id = u.id
  where public.is_admin()
     or p.id = auth.uid()
     or (
       public.current_profile_role() = 'hr_manager'
       and p.team_id = public.current_profile_team_id()
     );
$$;

revoke execute on function public.user_performance_stats() from public, anon;
revoke execute on function public.profile_last_sign_ins() from public, anon;
grant execute on function public.user_performance_stats() to authenticated;
grant execute on function public.profile_last_sign_ins() to authenticated;
