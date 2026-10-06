-- Adds candidates.location_verified so an Egypt-scoped search can record
-- whether a candidate's Egypt location was actually confirmed (true),
-- couldn't be determined either way (null), or the check never ran because
-- the job wasn't Egypt-scoped (also null — the two are not distinguished at
-- the column level; see src/lib/candidates/verifyEgyptLocation.ts). A
-- candidate confirmed to be outside Egypt is never persisted at all, so
-- `false` never actually appears in this column.

alter table public.candidates
  add column if not exists location_verified boolean;
