-- Lets an admin pre-assign a role/team to an email before that person has
-- ever signed in (a profile can't exist before its auth.users row). The
-- signup trigger consumes the matching row, so the account starts with the
-- right access instead of the default hr_user/no-team.

create table if not exists public.pending_role_assignments (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('admin', 'hr_manager', 'hr_user')),
  team_id uuid references public.teams(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.pending_role_assignments enable row level security;

create policy "admin_all_pending_role_assignments" on public.pending_role_assignments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  pending public.pending_role_assignments%rowtype;
begin
  select * into pending
  from public.pending_role_assignments
  where email = lower(new.email);

  insert into public.profiles (id, email, role, team_id)
  values (new.id, new.email, coalesce(pending.role, 'hr_user'), pending.team_id)
  on conflict (id) do nothing;

  -- Same invariant the admin API keeps: a manager leads the team they're in.
  if pending.role = 'hr_manager' and pending.team_id is not null then
    update public.teams set manager_id = new.id where id = pending.team_id;
  end if;

  if pending.email is not null then
    delete from public.pending_role_assignments where email = pending.email;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
