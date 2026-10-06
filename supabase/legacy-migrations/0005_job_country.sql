-- Adds jobs.country: the recruiter-picked city (Cairo/Alexandria/Giza/Suez)
-- that drives actual search targeting, now that jobs.location is always the
-- fixed nationwide "Egypt" value. See src/lib/jobs/constants.ts
-- (COUNTRY_OPTIONS) for the allowed values and
-- src/app/api/jobs/[id]/search/route.ts for how it's used to bias SerpApi.

alter table public.jobs
  add column if not exists country text;
