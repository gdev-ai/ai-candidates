-- Renames jobs.country to jobs.city: it always held a city value
-- (Cairo/Alexandria/Giza/Suez), never a country, and the field is now
-- optional rather than required (jobs.location, fixed to "Egypt", is the
-- required field). See src/lib/jobs/constants.ts (CITY_OPTIONS).

alter table public.jobs
  rename column country to city;
