-- Adds the tracking needed for the unified dashboard table and the
-- per-sourcing-file Average Match Quality calculation:
--   1. search_runs.created_by / created_by_email — who started the run
--   2. job_candidates.search_run_id / candidate_matches.search_run_id —
--      attributes a linked candidate (and its match score) to the run
--      that discovered it, so match quality can be grouped per "file"
--      (= search_run).
--   3. search_run_access — who last opened a run's candidate list, and when.
--   4. candidate_views — per-user "has this candidate been opened" tracking,
--      used to compute Unseen Candidates.
--
-- This app gates login via an application-level email allowlist
-- (src/lib/auth/allowlist.ts), so every authenticated user is already a
-- trusted team member. The new SELECT policies below are additive/
-- permissive — Postgres RLS OR's multiple permissive policies together —
-- so they only widen existing access to support the shared dashboard view
-- across teammates; they never narrow or replace existing policies.

alter table search_runs
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists created_by_email text;

alter table job_candidates
  add column if not exists search_run_id uuid references search_runs(id) on delete set null;

alter table candidate_matches
  add column if not exists search_run_id uuid references search_runs(id) on delete set null;

create table if not exists search_run_access (
  id uuid primary key default gen_random_uuid(),
  search_run_id uuid not null references search_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  accessed_at timestamptz not null default now()
);

create index if not exists search_run_access_run_idx
  on search_run_access (search_run_id, accessed_at desc);

create table if not exists candidate_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (user_id, candidate_id, job_id)
);

create index if not exists candidate_views_job_idx
  on candidate_views (job_id, candidate_id);

-- Best-effort backfill: existing job_candidates/candidate_matches rows
-- predate run attribution entirely, so there is no ground truth for which
-- run discovered them. The only unambiguous case is a job with exactly one
-- completed search run — attribute all of its existing candidates to that
-- run. Jobs with zero or multiple completed runs are left unattributed
-- (search_run_id stays null) rather than guessed; they simply won't count
-- toward per-file Average Match Quality until their next fresh run.
update job_candidates jc
set search_run_id = sr.id
from search_runs sr
where jc.search_run_id is null
  and sr.job_id = jc.job_id
  and sr.status = 'complete'
  and (
    select count(*) from search_runs sr2
    where sr2.job_id = jc.job_id and sr2.status = 'complete'
  ) = 1;

update candidate_matches cm
set search_run_id = jc.search_run_id
from job_candidates jc
where cm.search_run_id is null
  and jc.job_id = cm.job_id
  and jc.candidate_id = cm.candidate_id
  and jc.search_run_id is not null;

alter table search_run_access enable row level security;
alter table candidate_views enable row level security;

create policy "team_select_search_run_access" on search_run_access
  for select to authenticated using (true);
create policy "team_insert_own_search_run_access" on search_run_access
  for insert to authenticated with check (user_id = auth.uid());

create policy "team_select_candidate_views" on candidate_views
  for select to authenticated using (true);
create policy "team_insert_own_candidate_views" on candidate_views
  for insert to authenticated with check (user_id = auth.uid());
create policy "team_update_own_candidate_views" on candidate_views
  for update to authenticated using (user_id = auth.uid());

-- Widen read access to the whole allowlisted team for the shared dashboard.
-- Write policies are intentionally untouched.
create policy "team_select_jobs" on jobs
  for select to authenticated using (true);
create policy "team_select_candidates" on candidates
  for select to authenticated using (true);
create policy "team_select_job_candidates" on job_candidates
  for select to authenticated using (true);
create policy "team_select_search_runs" on search_runs
  for select to authenticated using (true);
create policy "team_select_candidate_matches" on candidate_matches
  for select to authenticated using (true);
