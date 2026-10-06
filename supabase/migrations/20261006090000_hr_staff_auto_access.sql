-- Active HR Portal staff get access without waiting for an invite.
--
-- ensure_member() used to make everyone without an invite a pending access
-- request. Anyone who is an active public.hr_staff (matched by auth user id,
-- or by email so a Microsoft sign-in that did not link to the existing
-- password account still counts) is now active straight away as hr_user. An
-- invite still wins, so admins can give HR staff a higher role or a team.
-- Pending requests from people who are HR staff are activated the next time
-- they sign in. Disabled members stay disabled.
--
-- The email match is only as trustworthy as the sign-in method's email
-- verification: keep Supabase email confirmation on, and restrict the
-- Microsoft (Azure) provider to the company tenant.

create or replace function sourcing.ensure_member()
returns sourcing.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_is_staff boolean;
  v_invite sourcing.invites%rowtype;
  v_member sourcing.members%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;

  select name, true into v_name, v_is_staff
  from public.hr_staff
  where active and (user_id = v_uid or lower(email) = v_email)
  order by (user_id = v_uid) desc
  limit 1;
  v_is_staff := coalesce(v_is_staff, false);

  select * into v_member from sourcing.members where user_id = v_uid;
  if found then
    if v_member.status = 'pending' and v_is_staff then
      update sourcing.members set status = 'active'
      where user_id = v_uid
      returning * into v_member;
    end if;
    return v_member;
  end if;

  select * into v_invite from sourcing.invites where email = v_email;

  insert into sourcing.members (user_id, email, full_name, role, team_id, status)
  values (
    v_uid,
    v_email,
    v_name,
    coalesce(v_invite.role, 'hr_user'),
    v_invite.team_id,
    case when v_invite.email is not null or v_is_staff then 'active' else 'pending' end
  )
  returning * into v_member;

  if v_invite.email is not null then
    delete from sourcing.invites where email = v_invite.email;
    if v_invite.role = 'hr_manager' and v_invite.team_id is not null then
      update sourcing.teams set manager_id = v_uid
      where id = v_invite.team_id and manager_id is null;
    end if;
  elsif not v_is_staff then
    insert into sourcing.activity_log (user_id, action, entity_type, entity_id, description, metadata)
    values (v_uid, 'auth.access_requested', 'member', v_uid,
            'Requested access to the app', jsonb_build_object('email', v_email));
  end if;

  return v_member;
end;
$$;
