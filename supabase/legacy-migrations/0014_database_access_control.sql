-- Moves sign-in access control from the hardcoded email allowlist in
-- src/lib/auth/allowlist.ts into the database: a user may use the app iff
-- their profile is active.
--
--  * New sign-ups start inactive unless an admin invited them first
--    (pending_role_assignments), so a stranger completing Google sign-in
--    gets a profile that can't do anything — it shows up for admins as an
--    access request instead.
--  * Existing profiles are synced to today's allowlist: listed emails stay
--    active, everyone else becomes inactive (they already couldn't sign in).
--  * The role helpers now ignore inactive profiles, so deactivating an admin
--    or manager revokes their elevated database access too, not just their
--    access through the app.

update public.profiles
set is_active = false
where is_active
  and lower(email) not in (
    'zeyad.ragab@thegdevelopments.com',
    'amr.fayez@thegdevelopments.com',
    'zeyadragab12@gmail.com',
    'zeyadboyka6@gmail.com'
  );

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

  -- Only an invited email starts with access.
  insert into public.profiles (id, email, role, team_id, is_active)
  values (
    new.id,
    new.email,
    coalesce(pending.role, 'hr_user'),
    pending.team_id,
    pending.email is not null
  )
  on conflict (id) do nothing;

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

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active
  );
$$;
