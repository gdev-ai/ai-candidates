-- Adds a `companies` lookup table so "Company Name" on the New Job form is
-- a dropdown of our actual company + sister companies, not free text, and
-- links each job to the company it's being sourced for.
--
-- jobs.company was previously never persisted at all (the New Job form
-- captured it in local component state but never sent it to the API — see
-- src/app/jobs/new/page.tsx before this change), so this is a pure
-- addition, not a backfill of a previously-populated column.

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists companies_sort_order_idx on public.companies (sort_order);

-- Seeded in display order: our own company first, then sister companies in
-- the order given. `on conflict do nothing` keeps this safe to re-run.
insert into public.companies (name, sort_order) values
  ('G Developments', 0),
  ('G Communities', 1),
  ('G Lifestyle', 2),
  ('G Hotels', 3),
  ('G Clubs', 4),
  ('G Utilities', 5),
  ('G Investments', 6),
  ('BuildDora', 7)
on conflict (name) do nothing;

alter table public.jobs
  add column if not exists company_id uuid references public.companies(id);

alter table public.companies enable row level security;

-- Same team-shared read model as migration 0001's other lookup data: every
-- allowlisted, authenticated user can see the full company list to pick
-- from. No insert/update/delete policy is granted here — the list is
-- managed directly in Supabase, not through the app.
create policy "team_select_companies" on public.companies
  for select to authenticated using (true);
