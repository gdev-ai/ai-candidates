# Sourcing database redesign: audit and proposal

Status: **draft for review**. Nothing has been built or migrated.
Target: a new `sourcing` schema inside the HR Portal Supabase project (`djsvjflhhgqqqfqpwgjs`).

## 1. Why it's being redesigned

The current database was mostly built by hand in the Supabase dashboard, so the repo's migrations don't describe it. We audited every table and column against the code, and every external API response against what we store. Main findings:

| Area | Finding |
|---|---|
| Stored vs available data | We keep 9 of ~60 fields from Apify, 4 of ~20 per search result, and nothing from OpenAI except the text. We pay for data and then throw it away. |
| "Raw" data | `candidates.raw_data` and `search_runs.raw_results` are **not raw**. They hold our own mapped objects, taken after filtering. The original provider payloads are never stored. |
| Bad data | Search-term highlights (`snippet_highlighted_words`) are saved as **skills**. `experience_years` adds up overlapping roles and rounds to a whole number. `credits_used` is made up (`queries.length`). |
| Overwriting | Enrichment overwrites the search snippet. Re-scoring overwrites the previous match. Better data never replaces worse data (only empty fields get filled). |
| Repeated cost | Candidates are stored per user, and every run re-enriches every profile, so we pay Apify again for profiles we already have. |
| Model | Pipeline status sits on the candidate, not the candidate-for-job pair. A person linked to 2 jobs shares one status, but dashboards count it per job. |
| Duplication | `candidate_matches` and `job_candidates` are 1:1 on the same key, and both carry `search_run_id`. `search_runs.created_by(_email)` always equals the job owner. `teams.manager_id` conflicts with `role='hr_manager'`. `candidate_status_history` is never read and duplicates `activity_log`. |
| Dedupe bugs | The LinkedIn slug is matched with `ilike '%/in/slug%'`, so `john` matches `johnsmith`. Non-LinkedIn URLs aren't normalized. Names aren't escaped in `ilike`. The unique constraint the code relies on isn't defined in the repo. |
| AI determinism | `temperature` is never sent. We use `json_object`, not strict schemas. Truncated (`finish_reason=length`) or refused responses aren't detected. Scores can come back as decimals. Retries are nested (up to ~15 billed calls). |
| Security | `record_failed_login` can be called directly by anonymous users. The signup trigger on `auth.users` would give every HR Portal signup a sourcing profile and notify admins. HR Portal's `is_hr()` lets **any** signed-in user in. |
| Performance | RLS calls `auth.uid()` and the helper functions once per row. Each table has 3 overlapping SELECT policies. Some child tables need a per-row EXISTS join. `user_performance_stats` totals the whole org and then filters. The dashboard loads every access row. |

## 2. Principles for the new schema

1. **Keep everything, in the right place.** Useful fields become columns. The full provider payload goes into an append-only raw log (§3.6), so data can be re-parsed later. Raw logs never sit in tables that list screens read.
2. **A person is global; the pipeline is per job.** One row per real person, enriched once. Recruiters work with the (job, person) pair.
3. **Record where data came from and how.** Store the source, model, prompt version and timestamp on anything derived.
4. **Real cost, measured.** Every external call is logged with its actual cost.
5. **One source of truth** for roles, team managers and statuses, enforced with check constraints and generated TS types.
6. **Cheap RLS.** One policy per table and command. `(select auth.uid())` and helper calls are wrapped so they run once per query. Helpers return sets of visible ids.

## 3. Proposed tables (`sourcing` schema)

Types are abbreviated. All tables use `id uuid pk default gen_random_uuid()` unless a composite PK is noted, `created_at timestamptz default now()`, and RLS enabled.

### 3.1 People and access

**`members`** replaces `profiles`. It holds sourcing access for an `auth.users` account.
- `user_id uuid pk → auth.users on delete cascade`
- `email text`, `full_name text`: display only, synced from `hr_staff` or auth
- `role text check in ('admin','hr_manager','hr_user')`
- `team_id → teams on delete set null`
- `status text check in ('pending','active','disabled')`: replaces the overloaded `is_active`
- `requested_at`, `created_at`, `updated_at`
- There is no trigger on `auth.users`. Rows are created by invite acceptance or on first sourcing login, as `pending`.

**`teams`**
- `name`
- `manager_id uuid unique → members(user_id) on delete set null`: **the only source of truth** for who manages a team. RLS and notifications use it; `role` only controls what a user can do.

**`invites`** replaces `pending_role_assignments`.
- `email pk (lowercase)`, `role`, `team_id`, `invited_by`, `created_at`

**Companies:** there is no table. `jobs.company_id` references `public.companies(id)`, the HR Portal list with logos and an active flag.

### 3.2 Jobs

**`jobs`**
- `owner_id → members`, `company_id → public.companies`
- `title`, `description`
- `country_code char(2) default 'EG'`, `city text null check in (…)`
- `employment_type`, `work_arrangement`, `seniority`, each nullable with a check (not `''`)
- `min_experience numeric(4,1)`, `max_experience numeric(4,1)`, with `check (min ≤ max and min ≥ 0)`
- `embedding vector(1536)`: optional, see §5
- `created_at`, `updated_at` (trigger)
- **Dropped:** `location` (always "Egypt"). `ai_analysis` moves to `job_analyses`. The skill, education and language arrays move to `job_requirements`.

**`job_requirements`** is the normalized analysis output. Match results can point at specific rows.
- `job_id`
- `kind text check in ('skill_required','skill_preferred','education','certification','language','industry','responsibility','keyword')`
- `text`, `canonical`, `weight numeric`, `sort_order`

**`job_analyses`** keeps every AI analysis of a job, generated on the server (today the client can edit it before saving).
- `job_id`, `ai_call_id → provider_calls`, `model`, `prompt_version`, `output jsonb`, `created_at`

### 3.3 Search

**`search_runs`**
- `job_id`, `created_by → members`
- `status check in ('pending','running','complete','error','cancelled')`
- `provider`, `queries text[]`: replaces the `search_queries` table and links queries to the run
- `total_results`, `candidates_found`, `candidates_new`: now actually filled
- `cost_usd numeric(10,4)`: a sum from `provider_calls`
- `error`, `started_at`, `completed_at`, `heartbeat_at`: lets us detect stuck runs
- `check (completed_at is null or status in ('complete','error','cancelled'))`

**`search_hits`** holds one row per search result, so the result's rank and snippet are kept.
- `search_run_id`, `provider_call_id`, `query`, `position`
- `link`, `title`, `snippet`
- `matched_terms text[]`: the highlighted words that used to be stored as "skills"
- `rich_snippet jsonb`
- `person_id → people null`: set once the result is resolved to a person

### 3.4 Person profile (global, enriched once)

**`people`**
- **Identity:**
  - `linkedin_member_id text unique`: Apify `id`, e.g. `ACoAA…`
  - `linkedin_object_urn text unique`: Apify `objectUrn`, the stable numeric member id
  - `linkedin_public_id text` (slug; **not unique-safe**, because LinkedIn vanity URLs get renamed; see §8.3)
  - `input_slugs text[]`: every slug we have queried that resolved to this person
  - `identity_key text unique`: `linkedin:<slug>`, `url:<normalized>` or `name-company:<n>|<c>`
  - `profile_url`
- **Name and headline:** `first_name`, `last_name`, `full_name`, `headline`, `about`, `search_snippet`
- **Current role:** `current_title`, `current_company`, `current_company_li_id`
- **Location:** `location_text`, `country_code`, `region`, `city`
- **Location check:** `location_verified bool null`, `location_method check in ('provider','deterministic','ai')`, `location_evidence`
- **Experience:** `experience_years numeric(4,1)`, computed from a union of date ranges
- **Profile signals:** `open_to_work`, `hiring`, `premium`, `verified`, `connections_count`, `followers_count`, `registered_at`
- **Photo:** `photo_url`, `photo_fetched_at`
- **Enrichment:** `enrichment_status check in ('none','pending','enriched','not_found','failed')`, `enriched_at`, `enrichment_error`
- `embedding vector(1536)`, `created_at`, `updated_at`

- `section_totals jsonb`: Apify caps each section at 20 items, so this records the real counts (e.g. 95 skills)

**Child tables** (all with `person_id` and cascade on delete). Field names below were verified against 243 real Apify items.
- **`person_experiences`**
  - `title`, `company`, `company_li_id` (nullable), `company_universal_name`, `experience_group_id`, `location`
  - `employment_type`, `workplace_type` (free text; null in 36% and 66% of items)
  - `start_year`, `start_month` (null if unknown), `end_year`, `end_month`, `is_current`: derived from `endDate.text = 'Present'`
  - `description`, `skills text[]`, `duration_text`
- **`person_education`**: `school`, `school_li_id`, `degree`, `field_of_study`, `start_year`, `end_year`, `description`
- **`person_skills`**
  - PK `(person_id, name)`
  - `endorsements int`: parsed from the text "9 endorsements"; null in about 80% of items
  - `is_top`: derived from whether the skill appears in `topSkills[]`
  - `source check in ('linkedin','serp','ai','recruiter')`
- **`person_certifications`**: `title`, `issuer`, `issuer_li_url`, `credential_url`, `issued_on`, `expires_on`. The two dates are parsed from strings like "Issued May 2024 · Expired May 2026".
- **`person_languages`**: `name`, `name_normalized` (ISO code), `proficiency check in ('native','full_professional','professional_working','limited_working','elementary') null`
- **Other sections** (projects, volunteering, awards, courses, recommendations, and `moreProfiles` "people also viewed") stay in the snapshot payload only. `moreProfiles` could later be used to find new candidates at no extra cost.

**`person_snapshots`** is the raw log of enrichment payloads.
- `person_id`, `provider_call_id`, `source`, `payload jsonb`, `fetched_at`

**Keeping recruiter edits:** fields a recruiter edits are recorded in `person_overrides(person_id, field, value, edited_by, edited_at)`. That way a re-enrichment refreshes provider data without undoing human corrections.

### 3.5 Pipeline (per job)

**`job_candidates`** merges `job_candidates`, `candidate_matches` and the per-candidate status.
- PK `(job_id, person_id)`
- `search_run_id → search_runs on delete set null`: the run that found the person
- `status check in ('New','Reviewed','Shortlisted','Contacted','Rejected','Hired') default 'New'`, `status_changed_at`, `status_changed_by`
- **Latest match, copied from `match_results` for fast lists:** `latest_match_id`, `match_score numeric(5,2)`, `scored_at`
- `found_at`

**`match_results`** is append-only history, so re-scoring never erases earlier results.
- `job_id`, `person_id` (FK to `job_candidates`), `ai_call_id`, `model`, `prompt_version`
- `match_score`, `skills_score`, `experience_score`, `location_score`, `education_score`, `seniority_score`: all `numeric(5,2) check 0–100`
- `weights jsonb`, `summary`
- `items jsonb`: `[{kind, requirement_id?, status: met|partial|missing, text, evidence}]`, replacing the four free-text arrays
- `created_at`

**`candidate_notes`**
- `job_id`, `person_id`, `author_id`, `note check (length(trim(note)) > 0)`, `created_at`
- Index `(job_id, person_id, created_at desc)`

**`candidate_views`**: PK `(user_id, job_id, person_id)`, `first_viewed_at`.

**`search_run_access`**: PK `(search_run_id, user_id)`, `last_accessed_at`. It's upserted, which keeps it small. `user_email` is dropped.

**Status history:** a trigger on `job_candidates.status` writes `candidate.status_changed` into `activity_log`, so the update and its log entry always commit together. The separate `candidate_status_history` table is dropped.

### 3.6 Logs and audit

**`provider_calls`** logs every external call: SerpApi/Serper, Apify and OpenAI. It is the raw log and the cost ledger.
- `provider`, `purpose` (`search`, `enrich`, `job_analysis`, `query_gen`, `location_check`, `match`, `embed`)
- `search_run_id`, `job_id`, `person_id`, `user_id`
- `provider_request_id` (SerpApi `search_metadata.id`, Apify run id, OpenAI `x-request-id`)
- `model`, `prompt_version`, `finish_reason`
- `prompt_tokens`, `completion_tokens`, `cached_tokens`, `reasoning_tokens`
- `credits`, `cost_usd`, `latency_ms`, `http_status`
- `status check in ('ok','empty','error','refused','truncated')`, `error`
- `request jsonb`, `response jsonb` (the **raw payload**)
- `created_at`
- Partitioned or TTL-pruned by `created_at`. Retention is set per `purpose` (see §6).

**`activity_log`**: kept as is, plus:
- `entity_type check (…)`
- indexes `(created_at desc)` and `(user_id, action, created_at desc)`
- the unused `(entity_type, entity_id)` index is dropped
- dedupe on `(action, entity_id)`, not on the description text

**`notifications`**: kept as is, including the column grant that only lets users update `read_at`.

### 3.7 Functions and RLS

- **Visibility helpers** (`security definer`, `search_path=''`, set-returning):
  - `sourcing.visible_owner_ids()`: self, plus team members if you're the team manager (via `teams.manager_id`), plus everyone if you're an admin
  - `sourcing.visible_job_ids()`
- **One policy per table per command.** For example, jobs SELECT is `owner_id in (select sourcing.visible_owner_ids())`, and child tables use `job_id in (select sourcing.visible_job_ids())`.
- **`people` and its child tables:** readable by any active member, because they are shared. Only the server writes them.
- **Report functions:**
  - `user_performance_stats(p_from, p_to, p_user_ids uuid[])` filters before it aggregates, and returns `(user_id, status, count)` rows, so adding a new status needs no migration.
  - `sourcing_files(...)` stays.
  - `team_sourcing_files` is dropped.
- **Server-only functions:**
  - `record_failed_login` runs **only from the server** with the service role; anon can't call it.
  - `profile_last_sign_ins` stays, with its helpers wrapped.
- **Schema defaults:** `alter default privileges in schema sourcing revoke execute on functions from public`. The schema is added to the API's exposed schemas, with explicit grants to `authenticated`. `anon` gets nothing.
- Uses its own `sourcing.set_updated_at()`. It does not overwrite `public.set_updated_at()`.

### 3.8 Required change in HR Portal (before any shared use)

```sql
create or replace function public.is_hr() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.hr_staff
                 where user_id = auth.uid() and active);
$$;
```

## 4. Old → new mapping

| Old | New |
|---|---|
| profiles | members (email/name kept for display; status replaces is_active) |
| teams.manager_id + role inference | teams.manager_id (unique, authoritative) |
| pending_role_assignments | invites |
| companies | public.companies |
| jobs.location | jobs.country_code |
| jobs.ai_analysis | job_analyses.output |
| jobs.required_skills / preferred_skills / education / certifications / languages / keywords arrays | job_requirements |
| jobs.work_arrangement, languages, keywords (unread) | kept, and now **fed into matching** |
| search_queries | search_runs.queries |
| search_runs.raw_results | provider_calls.response + search_hits |
| search_runs.credits_used | search_runs.cost_usd (real) |
| search_runs.created_by_email | join to members |
| candidates (per user) | people (global) + job_candidates (per job) |
| candidates.raw_data | person_snapshots.payload / provider_calls.response |
| candidates.source_url | search_hits.link |
| candidates.skills | person_skills (with source) |
| candidates.status | job_candidates.status |
| candidate_matches | match_results (history) + latest on job_candidates |
| candidate_status_history | activity_log via trigger |
| candidate_views.id, search_run_access.id / user_email | dropped (composite PKs) |

## 5. Service changes

Rule: **no subscriptions.** Pay-as-you-go, prepaid credit and free tiers are fine.
Volume assumed per month: 50 jobs × (~30 queries, ~100 candidates pre-scored, ~25 enriched).

**Pipeline:**
1. Search: Serper.
2. Pre-rank using the search snippet plus embeddings, with no enrichment cost.
3. Enrich the top **20** per job, plus up to 5 whose score is uncertain because the snippet was thin. Skip anyone already enriched. Enrichment is capped by a monthly budget, so the work fits inside Apify's free $5/month credit (see §8.3).
4. Run the full AI match on the enriched shortlist.

| Area | Now | Proposed (primary) | Fallback | Cost/month |
|---|---|---|---|---|
| Search | SerpApi subscription-style (free plan 250/mo) | **Serper**: prepaid, $1/1k, 2,500 free credits, paid credits expire after 6 months | SerpApi free 250/mo, already built; **DataForSEO** standard queue at $0.003 per `site:` query, $50 deposit that never expires | ~$5–8 |
| Discovery pilot | – | **Exa People Search** on its free $10 credit. Returns structured work/education history with dates; Egypt coverage is unverified. | – | $0 |
| Enrichment | Apify harvestapi actor (**blocked for good** on the free plan; each blocked attempt is still billed $0.004) | **Apify `supreme_coder~linkedin-profile-scraper`** on the free **$5/month** credit (it resets each billing cycle). $0.005 per profile + $0.00005 per run, which gives **~990 profiles/month free**. Verified live. Full work history and skills (with endorsement counts); the education, certification and language caps are accepted. Global cache in `people` with a freshness window. | **HarvestAPI direct API**: pay-as-you-go ($20 minimum prepaid, credit doesn't expire), $0.0064 per profile. Used only when the month's Apify credit is used up or supreme_coder fails. Needs `HARVESTAPI_API_KEY`. | **$0–2** |
| LLM | gpt-5.6-terra locally (production unknown), `json_object` | **gpt-6-luna** (after a side-by-side check against gpt-5.6-luna), Responses API, strict schemas, Flex for bulk scoring | gpt-5.6-luna, same schemas | ~$2–4 |
| Semantic ranking | none | `text-embedding-3-small` + pgvector | – | <$1 |
| Background work | `waitUntil` (runs get stuck) | **Vercel Workflows** | Inngest free tier | ~$0–1 |
| **Total** | | | | **~$8–15/month**, plus a one-time $50 Serper top-up once its 2,500 free credits run out. The $20 HarvestAPI top-up is only needed if the fallback is switched on. |

Other Apify actors tested live (see §8.3) and rejected:
- `datadoping`: experience is truncated and there are no skills.
- `apimaestro full`: $0.01 per profile and only 4 skills.
- `apimaestro batch`: limited to 10 profiles a day.
- `crustapi`: no titles or dates.

Other licensed data providers (PDL, Coresignal, Crustdata) are subscription-only, so they were excluded.

⚠️ **Legal:** every LinkedIn-profile enrichment option here, HarvestAPI included, gets its data by scraping LinkedIn while logged out. The app doesn't scrape LinkedIn itself, but this still goes against the intent of SPEC.md's rule against LinkedIn scraping. LinkedIn has sued and shut down similar vendors (Proxycurl in 2025, ProAPIs in 2026). The licensed alternative is People Data Labs (~$0.28 per record, so ~$280/month for a shortlist of 1k). How Egypt's Law 151/2020 applies has not been checked. **This needs a business or legal decision.**

## 6. Retention (proposal)

| Data | Keep for |
|---|---|
| `provider_calls.response` for search and enrich | 90 days, then keep the metadata and null out `request`/`response` |
| `provider_calls` for AI calls | 12 months (needed to audit scores) |
| `person_snapshots` | the latest 3 per person |
| People with no pipeline activity | review after 12 months |

`docs/data-retention.md` needs updating to use these tables.

## 7. Code fixes that go with the migration

1. Dedupe on `identity_key` / `linkedin_member_id` with `.eq`/upsert. No more `ilike`.
2. Stop saving `snippet_highlighted_words` as skills.
3. Compute experience from date ranges. Scores become `numeric`.
4. Check `finish_reason`, `refusal` and zod validation, and log them to `provider_calls`.
5. Remove the nested retries. Respect `Retry-After`.
6. Don't swallow errors: Egypt-check failures and partial enrichment failures are recorded per person.
7. Fix query generation, which puts the literal text `"Cairo OR Giza OR …"` in the query. Add a concurrency cap and pagination to search.
8. Generate job analysis on the server and store it. Stop trusting `ai_analysis` posted by the client.
9. Add `db: { schema: 'sourcing' }` to the 3 Supabase clients. Generate types with `supabase gen types --schema sourcing`.
10. `getDashboardData`: load access rows only for the runs being shown. Use explicit column lists instead of `select('*')` and `candidates(*)`.
11. Remove dead endpoints: `GET /api/teams`, `/api/teams/[id]`, `/api/teams/[id]/members` and `/api/admin/users`.

## 8. Verified service integration spec

Every item in this section was checked against official docs and the installed SDK. It was also tested with live calls on 2026-09-30, except where marked **(docs only)**. The raw responses are in the session scratchpad.

### 8.1 OpenAI (SDK `openai@7.20.0`, zod 4.6.5)

**Current problems, all verified live:**
- `.env.local` sets `OPENAI_MODEL=gpt-5.6-terra`, which costs 10× the intended luna.
- `json_object` doesn't enforce any schema.
- `reasoning_effort` is never sent, so it defaults to `medium`.
- There's no output cap.
- Retries are nested: the SDK does 2 and `withRetry` adds 5.
- `store` isn't sent, so OpenAI keeps the data by default.
- Usage, request id and the finish/refusal status are all thrown away.

**The correct call:**
- Use `client.responses.parse({...}).withResponse()` with `text.format: zodTextFormat(schema)`, `reasoning.effort`, `max_output_tokens`, `store: false` and `text.verbosity: "low"`.
- All 4 of the project's schemas were verified live in strict mode.
- `temperature` is only allowed when effort is `none`. Any other value returns 400.
- `max_tokens` and `minimal` both return 400.
- The client is created with `maxRetries: 3, timeout: 60_000`, and `withRetry` is removed.
- `status === "incomplete"` or a refusal is recorded in `provider_calls` and is **not** retried unchanged.

**Settings per call type:**

| Purpose | Model | Effort | max_output_tokens | Tier |
|---|---|---|---|---|
| job_analysis | gpt-5.6-luna | low | 4000 | default |
| query_gen | gpt-5.6-luna | low | 2000 | default |
| location_check | gpt-5.6-luna | none (+ temperature 0) | 300 | default |
| match (interactive) | gpt-5.6-luna | low | 3000 | default |
| match (bulk) | gpt-5.6-luna | low | 3000 | `flex` (15-min timeout; fall back to `auto` on 429) or Batch `/v1/responses` |
| embed | text-embedding-3-small | – | – | 1536 dims, `encoding_format: "float"` |

- The job-analysis schema must leave out `city`, because that field is set by the user, not the AI.
- `gpt-6-luna` works with our key at half the price of 5.6-luna. We should test it on real job descriptions before switching.

### 8.2 Search: Serper (primary), SerpApi (fallback)

**SerpApi live findings:**
- One search took **37 s** and was **billed after our 15 s timeout**. The retry was billed again.
- Without `hl`, results come back in Arabic, and titles contain the invisible character U+200F.
- The parser never extracted a company. The real source for company is `rich_snippet.top.extensions` (`[location, title, company]`).
- Bare `"Alexandria"` is ambiguous across countries.
- `"Mansoura"` skips the Egypt targeting.
- The account is on the Free plan: 250 searches/month, 84 left.

**SerpApi request:**
- `engine=google`, canonical `location` (for example `Cairo,Cairo Governorate,Egypt`), `gl=eg`, `hl=en`, `google_domain=google.com.eg`
- No `num`: Google fixes the page at 10.
- `start` for pagination.
- Timeout ≥ 60 s. Retry **only** on 429/5xx, **never** on a timeout.

**Serper request (docs only; `SERPER_API_KEY` is missing):**
- `POST https://google.serper.dev/search` with header `X-API-KEY` and body `{q, gl:"eg", hl:"en", num:10, page}`.
- Store the response's `credits` field as the cost.
- The `location` format, the error bodies and whether `attributes` appears are still to be checked with one live call.

**Query construction moves from the LLM prompt into code:**
- `site:linkedin.com/in ("T1" OR "T2") "skill" <location>`, where the location is `"Egypt"` or `("Cairo" OR "Giza" …)`. Quotes go around each term, not around the whole `OR` expression.
- Drop `site:linkedin.com/pub`.
- At most 1–2 quoted skills, and at most 32 words in total.

**Pagination:** request the next page only if the current one returned 10 hits, a next page exists, and at least 3 new `/in/` links appeared. Stop at 3 pages. Each page is logged as its own `provider_calls` row.

**Title parsing:**
1. Strip bidirectional-text characters.
2. Remove the `| LinkedIn` suffix.
3. Split on ` - ` into name and headline.
4. Take the company from `rich_snippet` first. Failing that, use the text after ` at ` in the headline (unless it ends in `...`). Failing that, use a third segment.
5. The headline is never treated as the verified current title.

### 8.3 Enrichment

**Decision (2026-10-04):**
- The **primary** is Apify `supreme_coder` on the free plan's $5/month credit.
- The **fallback** is the HarvestAPI direct API.
- The harvestapi *actor* is retired, because its free-user limit is **lifetime**, not monthly (the developer confirmed there is no reset).

**What we need from enrichment:** work experience, skills, and the person's basic details plus a way to reach them. We accept the caps on education, certifications and languages (2 each), the missing open-to-work flag, and the 3-roles-per-employer limit.

**Monthly budget guard:**
- Before each run, check how much credit is left using `GET /v2/users/me/limits`. Also cap every run with `maxTotalChargeUsd = n × 0.005 + 0.0001`.
- When fewer than ~$0.25 is left, send that month's remaining enrichments to HarvestAPI. If HarvestAPI isn't configured, mark them `enrichment_status='pending'` and pick them up after the credit resets.
- Expected volume: 50 jobs × 20 shortlisted, minus about 18% already cached, is roughly 820 profiles a month. That fits inside about 990.
- **Not verified:** whether the free plan hard-stops or blocks once the $5 is used. The guard above stops before that point either way.

**Contact data:**
- Enrichment returns the LinkedIn profile URL, name, headline, location and current company. That is enough to reach someone **through LinkedIn**.
- Email and phone are **not** returned with `findContacts:false`; it was verified that no such fields exist in the output.
- The actor has an optional email lookup (`findContacts: true`). It uses ContactCompass, needs a separate ContactCompass token, and costs $0.002 per email found. How many emails it finds and how accurate they are is untested.
- Collecting personal emails also raises the data-protection question (Egypt Law 151/2020). This is a separate decision.

**HarvestAPI direct API, the fallback (docs only; to verify with the free test credit before turning it on):**
- `GET https://api.harvestapi.io/linkedin/profile?query=<url>`, with the key in the `X-API-Key` header.
- The response is `{element, status, error, query:{url, publicIdentifier, profileId}}`. `element` has the same schema as the actor output described below.
- 5 requests at a time on Starter. About 4.9 s per profile.

**Apify `supreme_coder~linkedin-profile-scraper`, the primary (`yZnhB5JewWf9xSmoM`, verified live on 37 profiles; pricing taken from the actor's pricing settings, which took effect 2026-08-24):**
- Input: `{"urls":[{"url":…}],"scrapeCompany":false,"findContacts":false}`.
- $0.005 per profile. Failed profiles aren't charged. Pass `maxTotalChargeUsd`.
- Use `inputUrl` to map results back. It handled both renamed-slug cases correctly.
- Month is an integer (`timePeriod.startDate.month`). A current role is marked by `endDate: null`.

The harvestapi actor findings below are still accurate. The field shapes apply to the HarvestAPI direct API as well.

#### Retired: Apify `harvestapi~linkedin-profile-scraper` (actor `LpVuK3Zozwuipa5bp`)

⛔ **Blocked: the account is on Apify's FREE plan and has hit its 50-run cap.** Every run since 2026-09-27 has returned `{"error":"Free users are limited to 50 runs…"}` and was **still billed $0.004**. Enrichment in production is failing right now.

**Current request:**
- The input `{queries:[…], profileScraperMode:"Profile details no email ($4 per 1k)"}` is **correct**. It was checked against the build's input schema.
- Everything around it is wrong:
  - The sync endpoint keeps billing after our 90 s abort.
  - Retrying the POST can start a second billed run.
  - There's no cost cap: the default is the whole remaining balance.
  - There's no run timeout: the default is 5 hours.
  - The token is sent in the URL.

**Correct flow:**
1. **Start:** `POST /v2/acts/{id}/runs?timeout=180&memory=256&maxTotalChargeUsd=<n×0.004×1.25>&waitForFinish=60`
   - Sent with `Authorization: Bearer`.
   - Batches of 10 URLs.
   - 3–5 runs in parallel on a paid plan.
2. **Poll:** `GET /v2/actor-runs/{id}?waitForFinish=60` until the run finishes. In a workflow this is a durable `sleep` between polls.
3. **Read results:** `GET /v2/datasets/{defaultDatasetId}/items?clean=true`.
4. **Log cost:** record `usageTotalUsd` and `chargedEventCounts`.
5. **Retries:** only the start call, and only if no run id came back, plus the GETs.
6. **Stop on run-limit errors:** a `statusMessage` saying the run limit was hit is a hard stop that raises an alert and disables enrichment.

**Mapping results back:**
- Map each result by **`originalQuery.query`**, not by the output slug.
- **Existing bug:** LinkedIn renamed 2 of 243 profiles (0.8%). For those, the returned `publicIdentifier` differed from the one we sent, so today's code silently drops paid results.
- An input with no matching item is marked `not_found`. This case couldn't be tested live because of the run cap.

**Skip repeat enrichment:** 45 of 243 paid items (18%) were people we had already enriched. Skip anyone enriched within the TTL, matched by `objectUrn`, `publicIdentifier` or the input slug.

**Photos:** `photo` URLs are signed and expire after about 2 weeks. Copy them to storage, or accept that they expire (`photo_fetched_at`).

### 8.4 Background runs: Vercel Workflows (docs only)

- **Package:** `workflow@4.8.9`. Wrap `next.config.ts` with `withWorkflow()`. Steps are `"use step"` functions that retry on failure. Apify polling uses `sleep()`. `start()` is called from the route and the run id is stored on `search_runs`.
- **Middleware:** the matcher must exclude `.well-known/workflow/`.
- **Supabase access:** steps use a **service-role client** that points at the `sourcing` schema and filters by `owner_id` explicitly. Only ids are passed between steps; payloads stay in Postgres. Every write is an upsert, so a retried step is safe.
- **Runtime region:** 4.x runs execute in `iad1` (US East) while the database is in eu-west-1. That round-trip is acceptable at our volume.

### 8.5 Supabase (verified live on HR Portal)

- `vector` 0.8.2 is available but not installed. The `sourcing` schema doesn't exist yet.
- Queries through PostgREST are cut off at `statement_timeout=8s`, so vector RPCs must stay under that.
- **DDL:** `create extension vector with schema extensions`, columns typed `extensions.vector(1536)`, and an HNSW index using `extensions.vector_cosine_ops`.
- **Exposing the schema:** use the Management API, `PATCH /v1/projects/{ref}/postgrest {db_schema:"public,graphql_public,sourcing"}`. Keep the existing entries in the list.
- **Clients:** `@supabase/ssr` 0.12.7 accepts `db: { schema: 'sourcing' }` (verified in the installed types).

## 9. Open decisions

1. **Global people + per-job pipeline** (recommended) vs keeping per-user candidates. The recommended option means larger code changes, but it removes duplicate enrichment spend and fixes the status-per-job problem.
2. **Sourcing users vs HR Portal staff:** must every sourcing user also be in `hr_staff`, which would give them HR Portal access too? Or can recruiters be sourcing-only?
3. **Legal position on LinkedIn-derived enrichment** (§5).
4. **Old data:** migrate it from `ai-candidate-sourcing` (needs access to that project), or start fresh?
5. **Rollout:** build the schema and the new pipeline in one pass, or build the schema first and switch the services over afterwards?
