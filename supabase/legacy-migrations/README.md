# Legacy migrations (do not apply)

History of the original `ai-candidate-sourcing` project, kept for reference only.
The base tables were created by hand in Studio and are not described here.

The app now lives in the `sourcing` schema of the HR Portal project
(`djsvjflhhgqqqfqpwgjs`); see `docs/db-redesign.md` and `supabase/migrations/`.
Never replay these against HR Portal — 0014 deactivates every account except
four hardcoded emails, and 0002 creates a profile for every auth user.
