-- Phase 1 of the HR organizational structure feature: introduces teams,
-- per-user roles (admin / hr_manager / hr_user), and a generic, immutable
-- activity log, on top of the existing single-tier user model.
--
-- This migration is additive/backfill-only: it does not touch any existing
-- table's data, and it does not change the current `team_select_*` SELECT
-- policies from migration 0001 (still `using (true)` — every allowlisted
-- user keeps seeing all jobs/candidates/etc. as before). Team/role-scoped
-- enforcement of those policies is a deliberate follow-up step once the
-- manager-facing views exist to use it, so nobody's access changes yet.
--
-- Existing users are backfilled into a single "Default Team" with role
-- hr_user — nobody is auto-promoted to hr_manager or admin. That is an
-- explicit follow-up (admin assigns roles via the new profiles table).

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manager_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'hr_user' check (role in ('admin', 'hr_manager', 'hr_user')),
  team_id uuid references public.teams(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_team_idx on public.profiles (team_id);
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists teams_manager_idx on public.teams (manager_id);

drop trigger if exists set_teams_updated_at on public.teams;
create trigger set_teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile for every future signup, defaulting to the lowest
-- privilege role and no team until an admin assigns one.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.profiles (id, email, role, team_id)
  values (new.id, new.email, 'hr_user', null)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: one default team, every existing auth.users row gets an
-- hr_user profile in it. Safe to re-run (idempotent via NOT EXISTS checks).
insert into public.teams (name)
select 'Default Team'
where not exists (select 1 from public.teams);

insert into public.profiles (id, email, role, team_id)
select u.id, u.email, 'hr_user', (select id from public.teams order by created_at asc limit 1)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- SECURITY DEFINER helpers for RLS and app-layer checks. These are the only
-- safe way to read the caller's own role/team from inside a profiles RLS
-- policy without recursive-RLS deadlock (they run with the function
-- owner's privileges, which bypasses RLS on the internal lookup).
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_profile_team_id()
returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select team_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.teams enable row level security;
alter table public.profiles enable row level security;

create policy "admin_select_teams" on public.teams
  for select to authenticated
  using (public.is_admin());
create policy "member_select_own_team" on public.teams
  for select to authenticated
  using (id = public.current_profile_team_id());
create policy "admin_insert_teams" on public.teams
  for insert to authenticated
  with check (public.is_admin());
create policy "admin_update_teams" on public.teams
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "own_select_profile" on public.profiles
  for select to authenticated
  using (id = auth.uid());
create policy "admin_select_profiles" on public.profiles
  for select to authenticated
  using (public.is_admin());
create policy "manager_select_team_profiles" on public.profiles
  for select to authenticated
  using (
    public.current_profile_role() = 'hr_manager'
    and team_id = public.current_profile_team_id()
  );
create policy "admin_update_profiles" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Generic, append-only activity/audit log. No update or delete policy is
-- granted to `authenticated` on purpose: with RLS enabled and no policy for
-- a command, that command is denied by default, so this table cannot be
-- modified or deleted from the normal app interface.
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_user_idx on public.activity_log (user_id, created_at desc);
create index if not exists activity_log_entity_idx on public.activity_log (entity_type, entity_id);

alter table public.activity_log enable row level security;

create policy "own_select_activity_log" on public.activity_log
  for select to authenticated
  using (user_id = auth.uid());
create policy "admin_select_activity_log" on public.activity_log
  for select to authenticated
  using (public.is_admin());
create policy "manager_select_team_activity_log" on public.activity_log
  for select to authenticated
  using (
    public.current_profile_role() = 'hr_manager'
    and exists (
      select 1 from public.profiles target
      where target.id = public.activity_log.user_id
        and target.team_id = public.current_profile_team_id()
    )
  );
create policy "insert_own_activity_log" on public.activity_log
  for insert to authenticated
  with check (user_id = auth.uid());

-- handle_new_user is a trigger-only function (fires on auth.users insert),
-- never meant to be called directly -- same treatment as the existing
-- record_candidate_status_change trigger function.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- current_profile_role/current_profile_team_id/is_admin are meant to be
-- called by signed-in users (about themselves) and from RLS policies;
-- there is no reason for the unauthenticated anon role to call them.
revoke execute on function public.current_profile_role() from public, anon;
revoke execute on function public.current_profile_team_id() from public, anon;
revoke execute on function public.is_admin() from public, anon;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_team_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
