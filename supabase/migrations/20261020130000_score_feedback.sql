-- Human validation of AI match scores.
--
-- A dashboard user rates one AI score (a match_results row) thumbs up or
-- down, optionally says which way a wrong score is off (too high / too
-- low) and leaves a comment. One rating per user per score; rating again
-- replaces it. Ratings feed the tuning of the scoring criteria and prompt:
-- join to match_results for the score, model, prompt_version and items.
--
-- Anyone who can see the job can rate its scores (not only the owner): the
-- more reviewers, the better the signal. Users read and write only their
-- own ratings; analysis runs server-side (service role / SQL editor).

create table sourcing.score_feedback (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references sourcing.match_results (id) on delete cascade,
  user_id uuid not null references sourcing.members (user_id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  -- Only meaningful on a thumbs down.
  direction text check (direction in ('too_high', 'too_low')),
  comment text check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, user_id),
  check (direction is null or rating = 'down')
);
create index score_feedback_user_idx on sourcing.score_feedback (user_id);
create index score_feedback_created_idx on sourcing.score_feedback (created_at desc);

create or replace function sourcing.touch_score_feedback()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger score_feedback_touch
  before update on sourcing.score_feedback
  for each row execute function sourcing.touch_score_feedback();

alter table sourcing.score_feedback enable row level security;

create policy score_feedback_select on sourcing.score_feedback
  for select to authenticated
  using (user_id = (select auth.uid()));
-- match_results is itself RLS-filtered, so the subquery only finds scores
-- on jobs the caller can see.
create policy score_feedback_insert on sourcing.score_feedback
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select sourcing.is_active_member())
    and match_id in (select m.id from sourcing.match_results m)
  );
create policy score_feedback_update on sourcing.score_feedback
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and match_id in (select m.id from sourcing.match_results m)
  );
create policy score_feedback_delete on sourcing.score_feedback
  for delete to authenticated
  using (user_id = (select auth.uid()));
-- Table grants come from the schema's default privileges.
