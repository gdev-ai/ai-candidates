-- Function EXECUTE grants for the sourcing schema.
--
-- New functions get EXECUTE for PUBLIC from Postgres' global default; the
-- schema-level "alter default privileges ... revoke ... from public" in the
-- first migration doesn't override that. anon has no USAGE on `sourcing`, so
-- nothing was reachable, but grants should not rely on that alone.
--
-- Run by hand in the SQL editor (the MCP connector declines REVOKE). Re-run
-- after any migration that adds sourcing functions.

revoke execute on all functions in schema sourcing from public, anon;
grant execute on all functions in schema sourcing to authenticated, service_role;
