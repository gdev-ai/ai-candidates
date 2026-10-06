-- Switches sourcing data from "every signed-in user can read everything"
-- (migration 0001's `team_select_*` using (true) policies) to role-scoped
-- reads. After this, a row is readable only by:
--   * its owner                  (the original "Users can view own ..." policies)
--   * the owner's HR Manager     (manager_select_team_* from 0009)
--   * an admin                   (admin_select_* from 0007)
-- Writes were already owner-only and are unchanged. No data is modified
-- except moving admins out of teams (see below).
--
-- Rollback: recreate the dropped policies exactly as in 0001, e.g.
--   create policy "team_select_jobs" on jobs for select to authenticated using (true);

drop policy if exists "team_select_jobs" on public.jobs;
drop policy if exists "team_select_candidates" on public.candidates;
drop policy if exists "team_select_job_candidates" on public.job_candidates;
drop policy if exists "team_select_search_runs" on public.search_runs;
drop policy if exists "team_select_candidate_matches" on public.candidate_matches;
drop policy if exists "team_select_search_run_access" on public.search_run_access;
drop policy if exists "team_select_candidate_views" on public.candidate_views;

-- candidate_views had no owner-read policy (0001's blanket one covered it);
-- "unseen" counts only ever need the viewer's own rows.
create policy "own_select_candidate_views" on public.candidate_views
  for select to authenticated
  using (user_id = auth.uid());

-- A file's access history is visible to anyone who can see the file (owner,
-- their manager, admins), plus your own access rows.
create policy "select_access_for_visible_runs" on public.search_run_access
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.search_runs sr where sr.id = search_run_access.search_run_id)
  );

-- Admins already see the whole organization; being a member of a team as
-- well would put their own jobs into that team's figures and expose them to
-- the team's manager.
update public.profiles set team_id = null where role = 'admin' and team_id is not null;
