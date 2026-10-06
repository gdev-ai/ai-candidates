-- set_updated_at() was re-created outside tracked migrations without its
-- `search_path` pin, undoing the original fix_set_updated_at_search_path
-- hardening (flagged by the Supabase security advisor). Restores it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
