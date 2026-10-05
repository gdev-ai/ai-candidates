-- ai-candidates: `sourcing` schema inside the HR Portal project.
-- Design and rationale: docs/db-redesign.md.
--
-- Access model
--   * A signed-in account has sourcing access only through an active row in
--     sourcing.members. Rows are created by sourcing.ensure_member() (called
--     by the app after sign-in), never by a trigger on auth.users, so HR
--     Portal signups are unaffected.
--   * anon gets nothing in this schema.
--   * People (global candidate profiles) are written only by the server
--     (service role); members read them.
--   * Visibility: yourself, your team if you are its manager
--     (teams.manager_id), everyone if you are an admin.

create extension if not exists vector with schema extensions;

create schema if not exists sourcing;
revoke all on schema sourcing from public;
grant usage on schema sourcing to authenticated, service_role;

alter default privileges in schema sourcing revoke execute on functions from public;
alter default privileges in schema sourcing grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema sourcing grant all on tables to service_role;
alter default privileges in schema sourcing grant usage, select on sequences to authenticated, service_role;

create function sourcing.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Members, teams, invites
-- ---------------------------------------------------------------------------

create table sourcing.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- Only source of truth for who manages a team (RLS + notifications).
  manager_id uuid unique,
  created_at timestamptz not null default now()
);

create table sourcing.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (email = lower(email)),
  full_name text,
  role text not null default 'hr_user' check (role in ('admin', 'hr_manager', 'hr_user')),
  team_id uuid references sourcing.teams(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index members_team_idx on sourcing.members (team_id);
create trigger members_set_updated_at before update on sourcing.members
  for each row execute function sourcing.set_updated_at();

alter table sourcing.teams
  add constraint teams_manager_id_fkey foreign key (manager_id)
  references sourcing.members(user_id) on delete set null;

create table sourcing.invites (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('admin', 'hr_manager', 'hr_user')),
  team_id uuid references sourcing.teams(id) on delete set null,
  invited_by uuid references sourcing.members(user_id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

create table sourcing.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references sourcing.members(user_id) on delete restrict,
  company_id uuid references public.companies(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  description text not null,
  country_code char(2) not null default 'EG',
  city text check (city in ('Cairo', 'Alexandria', 'Giza', 'Suez')),
  employment_type text check (employment_type in ('Full-time', 'Part-time', 'Contract', 'Internship')),
  work_arrangement text check (work_arrangement in ('Remote', 'Hybrid', 'On-site')),
  seniority text check (seniority in ('intern', 'junior', 'mid', 'senior', 'lead', 'manager', 'director', 'executive')),
  min_experience numeric(4,1) check (min_experience >= 0),
  max_experience numeric(4,1) check (max_experience >= 0),
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_experience is null or max_experience is null or min_experience <= max_experience)
);
create index jobs_owner_created_idx on sourcing.jobs (owner_id, created_at desc);
create index jobs_company_idx on sourcing.jobs (company_id);
create trigger jobs_set_updated_at before update on sourcing.jobs
  for each row execute function sourcing.set_updated_at();

create table sourcing.job_requirements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references sourcing.jobs(id) on delete cascade,
  kind text not null check (kind in (
    'skill_required', 'skill_preferred', 'education', 'certification',
    'language', 'industry', 'responsibility', 'keyword'
  )),
  text text not null check (length(trim(text)) > 0),
  canonical text,
  weight numeric(4,2) not null default 1 check (weight >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index job_requirements_job_idx on sourcing.job_requirements (job_id, kind, sort_order);

-- ---------------------------------------------------------------------------
-- Search runs and global people
-- ---------------------------------------------------------------------------

create table sourcing.search_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references sourcing.jobs(id) on delete cascade,
  created_by uuid references sourcing.members(user_id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'complete', 'error', 'cancelled')),
  provider text not null check (provider in ('mock', 'serper', 'serpapi', 'exa')),
  queries text[] not null default '{}',
  workflow_run_id text,
  total_results bigint,
  candidates_found integer not null default 0 check (candidates_found >= 0),
  candidates_new integer not null default 0 check (candidates_new >= 0),
  cost_usd numeric(10,4) not null default 0 check (cost_usd >= 0),
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  check (completed_at is null or status in ('complete', 'error', 'cancelled'))
);
create index search_runs_job_idx on sourcing.search_runs (job_id, created_at desc);
create index search_runs_active_idx on sourcing.search_runs (status)
  where status in ('pending', 'running');

create table sourcing.people (
  id uuid primary key default gen_random_uuid(),
  -- linkedin:<slug> | url:<normalized> | name-company:<n>|<c>
  identity_key text not null unique,
  linkedin_member_id text unique,
  linkedin_object_urn text unique,
  -- Not unique: vanity URLs get renamed (see docs/db-redesign.md §8.3).
  linkedin_public_id text,
  input_slugs text[] not null default '{}',
  profile_url text,
  first_name text,
  last_name text,
  full_name text,
  headline text,
  about text,
  search_snippet text,
  current_title text,
  current_company text,
  current_company_li_id text,
  location_text text,
  country_code char(2),
  region text,
  city text,
  location_verified boolean,
  location_method text check (location_method in ('provider', 'deterministic', 'ai')),
  location_evidence text,
  experience_years numeric(4,1) check (experience_years >= 0),
  open_to_work boolean,
  hiring boolean,
  premium boolean,
  verified boolean,
  connections_count integer,
  followers_count integer,
  registered_at timestamptz,
  photo_url text,
  photo_fetched_at timestamptz,
  section_totals jsonb,
  enrichment_status text not null default 'none'
    check (enrichment_status in ('none', 'pending', 'enriched', 'not_found', 'failed')),
  enrichment_source text check (enrichment_source in ('apify_supreme', 'harvestapi', 'exa')),
  enriched_at timestamptz,
  enrichment_error text,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index people_public_id_idx on sourcing.people (linkedin_public_id);
create index people_input_slugs_idx on sourcing.people using gin (input_slugs);
create index people_enrichment_queue_idx on sourcing.people (enrichment_status)
  where enrichment_status in ('pending', 'failed');
create index people_embedding_idx on sourcing.people
  using hnsw (embedding extensions.vector_cosine_ops);
create trigger people_set_updated_at before update on sourcing.people
  for each row execute function sourcing.set_updated_at();

-- Every external call: raw log + cost ledger.
create table sourcing.provider_calls (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai', 'serper', 'serpapi', 'exa', 'apify', 'harvestapi')),
  purpose text not null check (purpose in (
    'search', 'enrich', 'job_analysis', 'query_gen', 'location_check', 'pre_score', 'match', 'embed'
  )),
  search_run_id uuid references sourcing.search_runs(id) on delete set null,
  job_id uuid references sourcing.jobs(id) on delete set null,
  person_id uuid references sourcing.people(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  provider_request_id text,
  model text,
  prompt_version text,
  finish_reason text,
  prompt_tokens integer,
  completion_tokens integer,
  cached_tokens integer,
  reasoning_tokens integer,
  credits numeric(12,4),
  cost_usd numeric(12,6),
  latency_ms integer,
  http_status integer,
  status text not null check (status in ('ok', 'empty', 'error', 'refused', 'truncated')),
  error text,
  request jsonb,
  response jsonb,
  created_at timestamptz not null default now()
);
create index provider_calls_run_idx on sourcing.provider_calls (search_run_id);
create index provider_calls_job_idx on sourcing.provider_calls (job_id);
create index provider_calls_person_idx on sourcing.provider_calls (person_id);
create index provider_calls_user_idx on sourcing.provider_calls (user_id);
create index provider_calls_created_idx on sourcing.provider_calls (provider, purpose, created_at desc);

create table sourcing.job_analyses (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references sourcing.jobs(id) on delete cascade,
  provider_call_id uuid references sourcing.provider_calls(id) on delete set null,
  model text not null,
  prompt_version text not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);
create index job_analyses_job_idx on sourcing.job_analyses (job_id, created_at desc);
create index job_analyses_call_idx on sourcing.job_analyses (provider_call_id);

create table sourcing.search_hits (
  id uuid primary key default gen_random_uuid(),
  search_run_id uuid not null references sourcing.search_runs(id) on delete cascade,
  provider_call_id uuid references sourcing.provider_calls(id) on delete set null,
  query text not null,
  page integer not null default 1 check (page >= 1),
  position integer not null check (position >= 1),
  link text not null,
  title text,
  snippet text,
  subtitle text,
  matched_terms text[] not null default '{}',
  rich_snippet jsonb,
  person_id uuid references sourcing.people(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (search_run_id, query, page, position)
);
create index search_hits_call_idx on sourcing.search_hits (provider_call_id);
create index search_hits_person_idx on sourcing.search_hits (person_id);

-- ---------------------------------------------------------------------------
-- Person detail (re-enrichment replaces a person's rows for its source)
-- ---------------------------------------------------------------------------

create table sourcing.person_experiences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references sourcing.people(id) on delete cascade,
  sort_order integer not null default 0,
  title text,
  company text,
  company_li_id text,
  company_universal_name text,
  experience_group_id text,
  location text,
  employment_type text,
  workplace_type text,
  start_year smallint,
  start_month smallint check (start_month between 1 and 12),
  end_year smallint,
  end_month smallint check (end_month between 1 and 12),
  is_current boolean not null default false,
  description text,
  skills text[] not null default '{}',
  duration_text text,
  source text not null check (source in ('apify_supreme', 'harvestapi', 'exa', 'recruiter')),
  created_at timestamptz not null default now()
);
create index person_experiences_person_idx on sourcing.person_experiences (person_id, sort_order);

create table sourcing.person_education (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references sourcing.people(id) on delete cascade,
  sort_order integer not null default 0,
  school text,
  school_li_id text,
  degree text,
  field_of_study text,
  start_year smallint,
  end_year smallint,
  description text,
  source text not null check (source in ('apify_supreme', 'harvestapi', 'exa', 'recruiter')),
  created_at timestamptz not null default now()
);
create index person_education_person_idx on sourcing.person_education (person_id, sort_order);

create table sourcing.person_skills (
  person_id uuid not null references sourcing.people(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  endorsements integer check (endorsements >= 0),
  is_top boolean not null default false,
  source text not null check (source in ('apify_supreme', 'harvestapi', 'exa', 'ai', 'recruiter')),
  created_at timestamptz not null default now(),
  primary key (person_id, name)
);

create table sourcing.person_certifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references sourcing.people(id) on delete cascade,
  title text not null,
  issuer text,
  issuer_li_url text,
  credential_url text,
  issued_on date,
  expires_on date,
  source text not null check (source in ('apify_supreme', 'harvestapi', 'exa', 'recruiter')),
  created_at timestamptz not null default now()
);
create index person_certifications_person_idx on sourcing.person_certifications (person_id);

create table sourcing.person_languages (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references sourcing.people(id) on delete cascade,
  name text not null,
  name_normalized text,
  proficiency text check (proficiency in (
    'native', 'full_professional', 'professional_working', 'limited_working', 'elementary'
  )),
  source text not null check (source in ('apify_supreme', 'harvestapi', 'exa', 'recruiter')),
  created_at timestamptz not null default now()
);
create index person_languages_person_idx on sourcing.person_languages (person_id);

-- Raw enrichment payloads, kept for audit and re-parsing.
create table sourcing.person_snapshots (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references sourcing.people(id) on delete cascade,
  provider_call_id uuid references sourcing.provider_calls(id) on delete set null,
  source text not null check (source in ('apify_supreme', 'harvestapi', 'exa', 'serper', 'serpapi')),
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
create index person_snapshots_person_idx on sourcing.person_snapshots (person_id, fetched_at desc);
create index person_snapshots_call_idx on sourcing.person_snapshots (provider_call_id);

-- Recruiter corrections survive re-enrichment.
create table sourcing.person_overrides (
  person_id uuid not null references sourcing.people(id) on delete cascade,
  field text not null,
  value jsonb,
  edited_by uuid references sourcing.members(user_id) on delete set null,
  edited_at timestamptz not null default now(),
  primary key (person_id, field)
);
create index person_overrides_editor_idx on sourcing.person_overrides (edited_by);

-- ---------------------------------------------------------------------------
-- Pipeline (per job)
-- ---------------------------------------------------------------------------

create table sourcing.job_candidates (
  job_id uuid not null references sourcing.jobs(id) on delete cascade,
  person_id uuid not null references sourcing.people(id) on delete cascade,
  search_run_id uuid references sourcing.search_runs(id) on delete set null,
  status text not null default 'New'
    check (status in ('New', 'Reviewed', 'Shortlisted', 'Contacted', 'Rejected', 'Hired')),
  status_changed_at timestamptz,
  status_changed_by uuid references sourcing.members(user_id) on delete set null,
  -- Cheap snippet/embedding score that decides who gets enriched.
  pre_score numeric(5,2) check (pre_score between 0 and 100),
  latest_match_id uuid,
  match_score numeric(5,2) check (match_score between 0 and 100),
  scored_at timestamptz,
  found_at timestamptz not null default now(),
  primary key (job_id, person_id)
);
create index job_candidates_person_idx on sourcing.job_candidates (person_id);
create index job_candidates_run_idx on sourcing.job_candidates (search_run_id);
create index job_candidates_score_idx on sourcing.job_candidates (job_id, match_score desc nulls last);
create index job_candidates_changed_by_idx on sourcing.job_candidates (status_changed_by);

create table sourcing.match_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  person_id uuid not null,
  provider_call_id uuid references sourcing.provider_calls(id) on delete set null,
  model text not null,
  prompt_version text not null,
  match_score numeric(5,2) not null check (match_score between 0 and 100),
  skills_score numeric(5,2) check (skills_score between 0 and 100),
  experience_score numeric(5,2) check (experience_score between 0 and 100),
  location_score numeric(5,2) check (location_score between 0 and 100),
  education_score numeric(5,2) check (education_score between 0 and 100),
  seniority_score numeric(5,2) check (seniority_score between 0 and 100),
  weights jsonb,
  summary text,
  -- [{kind, requirement_id?, status: met|partial|missing, text, evidence}]
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  foreign key (job_id, person_id)
    references sourcing.job_candidates(job_id, person_id) on delete cascade
);
create index match_results_pair_idx on sourcing.match_results (job_id, person_id, created_at desc);
create index match_results_call_idx on sourcing.match_results (provider_call_id);

alter table sourcing.job_candidates
  add constraint job_candidates_latest_match_id_fkey foreign key (latest_match_id)
  references sourcing.match_results(id) on delete set null;
create index job_candidates_latest_match_idx on sourcing.job_candidates (latest_match_id);

create table sourcing.candidate_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  person_id uuid not null,
  author_id uuid references sourcing.members(user_id) on delete set null,
  note text not null check (length(trim(note)) > 0),
  created_at timestamptz not null default now(),
  foreign key (job_id, person_id)
    references sourcing.job_candidates(job_id, person_id) on delete cascade
);
create index candidate_notes_pair_idx on sourcing.candidate_notes (job_id, person_id, created_at desc);
create index candidate_notes_author_idx on sourcing.candidate_notes (author_id);

create table sourcing.candidate_views (
  user_id uuid not null references sourcing.members(user_id) on delete cascade,
  job_id uuid not null,
  person_id uuid not null,
  first_viewed_at timestamptz not null default now(),
  primary key (user_id, job_id, person_id),
  foreign key (job_id, person_id)
    references sourcing.job_candidates(job_id, person_id) on delete cascade
);
create index candidate_views_pair_idx on sourcing.candidate_views (job_id, person_id);

create table sourcing.search_run_access (
  search_run_id uuid not null references sourcing.search_runs(id) on delete cascade,
  user_id uuid not null references sourcing.members(user_id) on delete cascade,
  last_accessed_at timestamptz not null default now(),
  primary key (search_run_id, user_id)
);
create index search_run_access_user_idx on sourcing.search_run_access (user_id, last_accessed_at desc);

-- ---------------------------------------------------------------------------
-- Activity log and notifications
-- ---------------------------------------------------------------------------

create table sourcing.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null
    check (entity_type in ('auth', 'member', 'team', 'job', 'search_run', 'candidate', 'report')),
  entity_id uuid,
  description text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index activity_log_created_idx on sourcing.activity_log (created_at desc);
create index activity_log_user_action_idx on sourcing.activity_log (user_id, action, created_at desc);
create index activity_log_dedupe_idx on sourcing.activity_log (action, entity_id, created_at desc);

create table sourcing.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references sourcing.members(user_id) on delete cascade,
  activity_id uuid not null references sourcing.activity_log(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, activity_id)
);
create index notifications_recipient_idx on sourcing.notifications (recipient_id, created_at desc);
create index notifications_activity_idx on sourcing.notifications (activity_id);

-- ---------------------------------------------------------------------------
-- Visibility helpers (SECURITY DEFINER: read members/teams/jobs without
-- recursive RLS; set-returning so policies evaluate them once per query)
-- ---------------------------------------------------------------------------

create function sourcing.is_active_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from sourcing.members
    where user_id = (select auth.uid()) and status = 'active'
  );
$$;

create function sourcing.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from sourcing.members
    where user_id = (select auth.uid()) and status = 'active' and role = 'admin'
  );
$$;

create function sourcing.my_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select role from sourcing.members
  where user_id = (select auth.uid()) and status = 'active';
$$;

-- Self, plus your team if you manage it, plus everyone if you are an admin.
create function sourcing.visible_owner_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  with me as (
    select user_id, role from sourcing.members
    where user_id = (select auth.uid()) and status = 'active'
  )
  select m.user_id
  from sourcing.members m, me
  where m.user_id = me.user_id
     or me.role = 'admin'
     or m.team_id in (select t.id from sourcing.teams t where t.manager_id = me.user_id);
$$;

create function sourcing.visible_job_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select j.id from sourcing.jobs j
  where j.owner_id in (select sourcing.visible_owner_ids());
$$;

create function sourcing.visible_run_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select r.id from sourcing.search_runs r
  where r.job_id in (select sourcing.visible_job_ids());
$$;

-- Jobs the caller owns and may write to.
create function sourcing.my_job_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select j.id from sourcing.jobs j
  where j.owner_id = (select auth.uid())
    and exists (
      select 1 from sourcing.members
      where user_id = (select auth.uid()) and status = 'active'
    );
$$;

create function sourcing.my_team_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select team_id from sourcing.members
  where user_id = (select auth.uid()) and status = 'active';
$$;

grant execute on function
  sourcing.is_active_member(), sourcing.is_admin(), sourcing.my_role(),
  sourcing.visible_owner_ids(), sourcing.visible_job_ids(), sourcing.visible_run_ids(),
  sourcing.my_job_ids(), sourcing.my_team_id()
to authenticated, service_role;

-- Called by the app after every sign-in. Creates the caller's member row on
-- first use: active with the invited role/team when an invite exists,
-- otherwise pending (an access request that notifies admins).
create function sourcing.ensure_member()
returns sourcing.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_invite sourcing.invites%rowtype;
  v_member sourcing.members%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_member from sourcing.members where user_id = v_uid;
  if found then
    return v_member;
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;
  select name into v_name from public.hr_staff where user_id = v_uid;
  select * into v_invite from sourcing.invites where email = v_email;

  insert into sourcing.members (user_id, email, full_name, role, team_id, status)
  values (
    v_uid,
    v_email,
    v_name,
    coalesce(v_invite.role, 'hr_user'),
    v_invite.team_id,
    case when v_invite.email is not null then 'active' else 'pending' end
  )
  returning * into v_member;

  if v_invite.email is not null then
    delete from sourcing.invites where email = v_invite.email;
    if v_invite.role = 'hr_manager' and v_invite.team_id is not null then
      update sourcing.teams set manager_id = v_uid
      where id = v_invite.team_id and manager_id is null;
    end if;
  else
    insert into sourcing.activity_log (user_id, action, entity_type, entity_id, description, metadata)
    values (v_uid, 'auth.access_requested', 'member', v_uid,
            'Requested access to the app', jsonb_build_object('email', v_email));
  end if;

  return v_member;
end;
$$;
grant execute on function sourcing.ensure_member() to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function sourcing.stamp_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at = now();
    new.status_changed_by = auth.uid();
  end if;
  return new;
end;
$$;

create trigger job_candidates_stamp_status before update of status on sourcing.job_candidates
  for each row execute function sourcing.stamp_status_change();

-- Status history lives in activity_log, written in the same transaction as
-- the change (replaces the old candidate_status_history table).
create function sourcing.log_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.status is distinct from old.status then
    select coalesce(full_name, 'Candidate') into v_name from sourcing.people where id = new.person_id;
    insert into sourcing.activity_log (user_id, action, entity_type, entity_id, description, metadata)
    values (
      auth.uid(), 'candidate.status_changed', 'candidate', new.person_id,
      format('%s moved from %s to %s', v_name, old.status, new.status),
      jsonb_build_object('jobId', new.job_id, 'oldStatus', old.status, 'newStatus', new.status)
    );
  end if;
  return null;
end;
$$;

create trigger job_candidates_log_status after update of status on sourcing.job_candidates
  for each row execute function sourcing.log_status_change();

create function sourcing.notify_on_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.action = 'auth.access_requested' then
    insert into sourcing.notifications (recipient_id, activity_id)
    select a.user_id, new.id
    from sourcing.members a
    where a.role = 'admin' and a.status = 'active' and a.user_id is distinct from new.user_id
    on conflict (recipient_id, activity_id) do nothing;
    return null;
  end if;

  if not (
    new.action in ('sourcing_run.started', 'sourcing_run.completed', 'sourcing_run.failed')
    or (new.action = 'candidate.status_changed' and new.metadata->>'newStatus' in ('Shortlisted', 'Hired'))
    or (
      new.action = 'job.candidates_scored'
      and coalesce(new.metadata->>'strongMatches', '') ~ '^[0-9]+$'
      and (new.metadata->>'strongMatches')::integer > 0
    )
  ) then
    return null;
  end if;

  insert into sourcing.notifications (recipient_id, activity_id)
  select t.manager_id, new.id
  from sourcing.members actor
  join sourcing.teams t on t.id = actor.team_id
  join sourcing.members mgr on mgr.user_id = t.manager_id
  where actor.user_id = new.user_id
    and mgr.status = 'active'
    and t.manager_id <> new.user_id
  on conflict (recipient_id, activity_id) do nothing;

  return null;
end;
$$;

create trigger activity_log_notify after insert on sourcing.activity_log
  for each row execute function sourcing.notify_on_activity();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table sourcing.teams enable row level security;
alter table sourcing.members enable row level security;
alter table sourcing.invites enable row level security;
alter table sourcing.jobs enable row level security;
alter table sourcing.job_requirements enable row level security;
alter table sourcing.job_analyses enable row level security;
alter table sourcing.search_runs enable row level security;
alter table sourcing.search_hits enable row level security;
alter table sourcing.people enable row level security;
alter table sourcing.person_experiences enable row level security;
alter table sourcing.person_education enable row level security;
alter table sourcing.person_skills enable row level security;
alter table sourcing.person_certifications enable row level security;
alter table sourcing.person_languages enable row level security;
alter table sourcing.person_snapshots enable row level security;
alter table sourcing.person_overrides enable row level security;
alter table sourcing.provider_calls enable row level security;
alter table sourcing.job_candidates enable row level security;
alter table sourcing.match_results enable row level security;
alter table sourcing.candidate_notes enable row level security;
alter table sourcing.candidate_views enable row level security;
alter table sourcing.search_run_access enable row level security;
alter table sourcing.activity_log enable row level security;
alter table sourcing.notifications enable row level security;

-- members: see yourself (even while pending) and whoever you can see; only
-- admins change roles/teams/status. Rows are created by ensure_member().
create policy members_select on sourcing.members for select to authenticated
  using (user_id = (select auth.uid()) or user_id in (select sourcing.visible_owner_ids()));
create policy members_update on sourcing.members for update to authenticated
  using ((select sourcing.is_admin())) with check ((select sourcing.is_admin()));

create policy teams_select on sourcing.teams for select to authenticated
  using (
    (select sourcing.is_admin())
    or id = (select sourcing.my_team_id())
    or manager_id = (select auth.uid())
  );
create policy teams_insert on sourcing.teams for insert to authenticated
  with check ((select sourcing.is_admin()));
create policy teams_update on sourcing.teams for update to authenticated
  using ((select sourcing.is_admin())) with check ((select sourcing.is_admin()));
create policy teams_delete on sourcing.teams for delete to authenticated
  using ((select sourcing.is_admin()));

create policy invites_admin on sourcing.invites for all to authenticated
  using ((select sourcing.is_admin())) with check ((select sourcing.is_admin()));

create policy jobs_select on sourcing.jobs for select to authenticated
  using (owner_id in (select sourcing.visible_owner_ids()));
create policy jobs_insert on sourcing.jobs for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select sourcing.is_active_member()));
create policy jobs_update on sourcing.jobs for update to authenticated
  using (id in (select sourcing.my_job_ids()))
  with check (owner_id = (select auth.uid()));
create policy jobs_delete on sourcing.jobs for delete to authenticated
  using (id in (select sourcing.my_job_ids()));

create policy job_requirements_select on sourcing.job_requirements for select to authenticated
  using (job_id in (select sourcing.visible_job_ids()));
create policy job_requirements_write on sourcing.job_requirements for all to authenticated
  using (job_id in (select sourcing.my_job_ids()))
  with check (job_id in (select sourcing.my_job_ids()));

create policy job_analyses_select on sourcing.job_analyses for select to authenticated
  using (job_id in (select sourcing.visible_job_ids()));

create policy search_runs_select on sourcing.search_runs for select to authenticated
  using (job_id in (select sourcing.visible_job_ids()));
create policy search_runs_insert on sourcing.search_runs for insert to authenticated
  with check (job_id in (select sourcing.my_job_ids()) and created_by = (select auth.uid()));
create policy search_runs_update on sourcing.search_runs for update to authenticated
  using (job_id in (select sourcing.my_job_ids()))
  with check (job_id in (select sourcing.my_job_ids()));

create policy search_hits_select on sourcing.search_hits for select to authenticated
  using (search_run_id in (select sourcing.visible_run_ids()));

-- Global profiles: any active member reads; only the server writes.
create policy people_select on sourcing.people for select to authenticated
  using ((select sourcing.is_active_member()));
create policy person_experiences_select on sourcing.person_experiences for select to authenticated
  using ((select sourcing.is_active_member()));
create policy person_education_select on sourcing.person_education for select to authenticated
  using ((select sourcing.is_active_member()));
create policy person_skills_select on sourcing.person_skills for select to authenticated
  using ((select sourcing.is_active_member()));
create policy person_certifications_select on sourcing.person_certifications for select to authenticated
  using ((select sourcing.is_active_member()));
create policy person_languages_select on sourcing.person_languages for select to authenticated
  using ((select sourcing.is_active_member()));
create policy person_snapshots_select on sourcing.person_snapshots for select to authenticated
  using ((select sourcing.is_admin()));
create policy person_overrides_select on sourcing.person_overrides for select to authenticated
  using ((select sourcing.is_active_member()));
create policy person_overrides_write on sourcing.person_overrides for all to authenticated
  using ((select sourcing.is_active_member()) and edited_by = (select auth.uid()))
  with check ((select sourcing.is_active_member()) and edited_by = (select auth.uid()));

create policy provider_calls_select on sourcing.provider_calls for select to authenticated
  using ((select sourcing.is_admin()));

create policy job_candidates_select on sourcing.job_candidates for select to authenticated
  using (job_id in (select sourcing.visible_job_ids()));
create policy job_candidates_update on sourcing.job_candidates for update to authenticated
  using (job_id in (select sourcing.my_job_ids()))
  with check (job_id in (select sourcing.my_job_ids()));
create policy job_candidates_delete on sourcing.job_candidates for delete to authenticated
  using (job_id in (select sourcing.my_job_ids()));

create policy match_results_select on sourcing.match_results for select to authenticated
  using (job_id in (select sourcing.visible_job_ids()));

create policy candidate_notes_select on sourcing.candidate_notes for select to authenticated
  using (job_id in (select sourcing.visible_job_ids()));
create policy candidate_notes_insert on sourcing.candidate_notes for insert to authenticated
  with check (author_id = (select auth.uid()) and job_id in (select sourcing.my_job_ids()));

create policy candidate_views_own on sourcing.candidate_views for all to authenticated
  using (user_id = (select auth.uid()) and (select sourcing.is_active_member()))
  with check (user_id = (select auth.uid()) and job_id in (select sourcing.visible_job_ids()));

create policy search_run_access_select on sourcing.search_run_access for select to authenticated
  using (search_run_id in (select sourcing.visible_run_ids()));
create policy search_run_access_insert on sourcing.search_run_access for insert to authenticated
  with check (user_id = (select auth.uid()) and search_run_id in (select sourcing.visible_run_ids()));
create policy search_run_access_update on sourcing.search_run_access for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and search_run_id in (select sourcing.visible_run_ids()));

create policy activity_log_select on sourcing.activity_log for select to authenticated
  using ((select sourcing.is_admin()) or user_id in (select sourcing.visible_owner_ids()));
create policy activity_log_insert on sourcing.activity_log for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy notifications_select on sourcing.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy notifications_update on sourcing.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

-- Notifications are created by the trigger only; users may only mark read.
revoke insert, delete, update on sourcing.notifications from authenticated;
grant update (read_at) on sourcing.notifications to authenticated;
-- Server-only tables: no client writes even if a policy is added by mistake.
revoke insert, update, delete on
  sourcing.people, sourcing.person_experiences, sourcing.person_education,
  sourcing.person_skills, sourcing.person_certifications, sourcing.person_languages,
  sourcing.person_snapshots, sourcing.provider_calls, sourcing.search_hits,
  sourcing.job_analyses, sourcing.match_results
from authenticated;
