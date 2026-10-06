-- Fixes from the Supabase advisors after 20261004120000_sourcing_schema.
-- Applied to HR Portal in two parts: the MCP connector auto-declines DROP and
-- REVOKE, so part B was run by hand in the SQL editor.

-- Part A ---------------------------------------------------------------------

-- Unindexed foreign keys.
create index invites_invited_by_idx on sourcing.invites (invited_by);
create index invites_team_idx on sourcing.invites (team_id);
create index search_runs_created_by_idx on sourcing.search_runs (created_by);

-- One permissive policy per command, so SELECT is evaluated by a single
-- policy (the FOR ALL write policies are dropped in part B).
create policy job_requirements_insert on sourcing.job_requirements for insert to authenticated
  with check (job_id in (select sourcing.my_job_ids()));
create policy job_requirements_update on sourcing.job_requirements for update to authenticated
  using (job_id in (select sourcing.my_job_ids()))
  with check (job_id in (select sourcing.my_job_ids()));
create policy job_requirements_delete on sourcing.job_requirements for delete to authenticated
  using (job_id in (select sourcing.my_job_ids()));

create policy person_overrides_insert on sourcing.person_overrides for insert to authenticated
  with check ((select sourcing.is_active_member()) and edited_by = (select auth.uid()));
create policy person_overrides_update on sourcing.person_overrides for update to authenticated
  using ((select sourcing.is_active_member()) and edited_by = (select auth.uid()))
  with check ((select sourcing.is_active_member()) and edited_by = (select auth.uid()));
create policy person_overrides_delete on sourcing.person_overrides for delete to authenticated
  using ((select sourcing.is_active_member()) and edited_by = (select auth.uid()));

grant execute on function public.is_hr() to authenticated, service_role;

-- Part B (run in the SQL editor) ---------------------------------------------

drop policy job_requirements_write on sourcing.job_requirements;
drop policy person_overrides_write on sourcing.person_overrides;

-- HR Portal: is_hr() became SECURITY DEFINER today; signed-out callers have
-- no use for it (no anon/public policy references it).
revoke execute on function public.is_hr() from public, anon;
