-- Live progress for a sourcing run, read by the search loading screen.
--
-- stage: the step the workflow is on (written at each transition).
-- max_candidates: how many people the run AI-scores (the user's pick).
-- shortlist_size / enrich_total: totals for the "n of m" counters.
-- candidates_scored: people AI-scored by the run (candidates_found also
--   counts the extra in-country people kept without a score).

alter table sourcing.search_runs
  add column if not exists stage text,
  add column if not exists max_candidates integer,
  add column if not exists shortlist_size integer,
  add column if not exists enrich_total integer,
  add column if not exists candidates_scored integer;

alter table sourcing.search_runs
  drop constraint if exists search_runs_stage_check;
alter table sourcing.search_runs
  add constraint search_runs_stage_check check (
    stage is null or stage in (
      'searching', 'locating', 'expanding', 'shortlisting',
      'enriching', 'scoring', 'finalizing'
    )
  );

-- Runs since the candidate limit shipped all used the default of 10; they
-- seed the time estimate.
update sourcing.search_runs
set max_candidates = 10
where max_candidates is null
  and status = 'complete'
  and candidates_found <= 10
  and created_at >= '2026-10-05 09:20:00+00';
