# Internal API contract (sourcing schema rebuild)

Fixed interfaces between the three work areas of the rebuild, so they can be
built in parallel. Schema: `supabase/migrations/20261004120000_sourcing_schema.sql`.
Design: `docs/db-redesign.md`. DB types: `src/types/database.types.ts`
(regenerate with `npm run db:types`); helpers in `src/lib/supabase/types.ts`.

## Shared foundation (done — use, don't rewrite)

| Need | Use |
|---|---|
| User-scoped DB client (RLS) | `createClient()` from `@/lib/supabase/server` / `@/lib/supabase/client` — already pinned to `sourcing` |
| HR Portal tables (`companies` only) | `supabase.schema("public").from("companies")` |
| Server-only writes / background work | `createServiceClient()` from `@/lib/supabase/service` — bypasses RLS, **filter by owner/job yourself** |
| Route auth | `requireUser()` → `{ user, supabase, member }`; `requireRole([...])` |
| Member shape | `Member` from `@/lib/auth/access` (`user_id, email, full_name, role, team_id, status`) |
| Owner checks | `forbidUnlessOwner`, `describeOwnership` from `@/lib/auth/ownership` |
| Activity log | `logActivity` / `logActivityOnce` from `@/lib/activity/log` (entity types: auth, member, team, job, search_run, candidate, report) |
| External call log + cost | `recordProviderCall()` from `@/lib/providers/callLog` — every OpenAI/Serper/SerpApi/Exa/Apify/HarvestAPI call |
| Names | `getDisplayName(email, fullName)` |

Candidate status history is written by a DB trigger on `job_candidates.status`;
routes must **not** log `candidate.status_changed` themselves.

## Ownership by area

- **P — pipeline & providers:** `src/lib/ai/**`, `src/lib/search/**`, `src/lib/enrichment/**`,
  `src/lib/candidates/**` except `filterAndSort.ts` and `statuses.ts`, `src/lib/jobs/queue.ts`,
  `src/workflows/**`, `src/types/{job-analysis,matching,search}.ts`, `next.config.ts`, `package.json`.
  Routes: `api/jobs/analyze`, `api/jobs/generate-queries`, `api/jobs/[id]/search`,
  `api/search/[runId]/status`, `api/jobs/[id]/match`, `api/candidates/match`.
- **J — jobs & candidates UI/API:** `src/app/jobs/**`, `src/app/candidates/**`,
  `src/components/{jobs,candidates}/**`, `src/lib/export/**`, `src/lib/candidates/{filterAndSort,statuses}.ts`,
  `src/types/{job,candidate}.ts`. Routes: `api/jobs` (list/create), `api/jobs/[id]` (get/update/delete),
  `api/jobs/[id]/candidates`, `api/jobs/[id]/export`, `api/candidates/[id]/**`,
  `api/search-runs/[runId]/access`, `api/companies`.
- **A — admin, teams, dashboards, reports:** `src/app/{admin,manager,reports,dashboard,settings}/**`,
  `src/components/{admin,manager,reports,dashboard}/**`, `src/lib/{admin,manager,reports,dashboard,notifications,performance,teams}/**`,
  `src/lib/activity/{feed,actions}.ts`, `src/types/team.ts`. Routes: `api/admin/**`, `api/teams/**`,
  `api/notifications`, `api/reports`. New SQL report functions go in a **new migration file** (not applied by the agent).

## Endpoints between J (UI) and P (pipeline)

All JSON; errors `{ error: string }` with 4xx/5xx.

1. `POST /api/jobs/analyze` **(P)** — body `{ description: string }`.
   Runs the AI job analysis, logs it in `provider_calls`, returns
   `{ analysis: JobAnalysis, analysisCallId: string | null }`.
   `JobAnalysis` = `src/types/job-analysis.ts` (P owns; it keeps today's fields, minus `city`/`location`,
   with `seniority` normalized to the `jobs.seniority` values).
2. `POST /api/jobs` **(J)** — body: job fields (`title, description, company_id?, city?, employment_type?,
   work_arrangement?, seniority?, min_experience?, max_experience?`) + `requirements: { kind, text }[]`
   (kinds = `job_requirements.kind`) + `analysisCallId?: string`.
   Inserts `jobs` + `job_requirements`; when `analysisCallId` is given, copies that call's parsed
   output **from `provider_calls` server-side** into `job_analyses` (never trust analysis JSON from the client).
   Returns `{ job }`.
3. `POST /api/jobs/generate-queries` **(P)** — body `{ jobId: string }`. Returns `{ queries: string[] }`
   (owner only). Location group and `site:` are built in code, not by the LLM.
4. `POST /api/jobs/[id]/search` **(P)** — body `{ queries: string[] }` (owner only). Creates the
   `search_runs` row and starts the background run. Returns `202 { run: { id, status } }`.
5. `GET /api/search/[runId]/status` **(P)** — returns
   `{ status, error, candidates_found, candidates_new, started_at, completed_at }`.
6. `POST /api/jobs/[id]/match` **(P)** — (re)scores the job's candidates. Returns
   `{ scored: number, failed: number, strongMatches: number }`.
7. `POST /api/candidates/match` **(P)** — body `{ jobId, personId }`, rescores one. Returns `{ match }`
   (a `match_results` row).

Reading results is J's: `GET /api/jobs/[id]/candidates` reads `job_candidates` joined to `people`
(+ child tables as needed) and the latest `match_results`.
