-- Search credits per tenant: everyone running on the same provider API keys
-- shares one daily / weekly / monthly search budget.
--
-- tenant_key is computed by the app from its API keys (src/lib/usage/tenant.ts)
-- and stamped on every search run and provider call. Rows written before this
-- migration are backfilled by hand with the current key.

alter table sourcing.search_runs add column tenant_key text;
alter table sourcing.provider_calls add column tenant_key text;

create index search_runs_tenant_created_idx
  on sourcing.search_runs (tenant_key, created_at);
create index provider_calls_tenant_created_idx
  on sourcing.provider_calls (tenant_key, created_at);

-- Searches allowed per calendar day / week / month. No row = app defaults.
create table sourcing.usage_limits (
  tenant_key text primary key,
  daily_searches int not null check (daily_searches >= 0),
  weekly_searches int not null check (weekly_searches >= 0),
  monthly_searches int not null check (monthly_searches >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Read and written only by the server (service role).
alter table sourcing.usage_limits enable row level security;

-- Searches started and money spent by a tenant in the current calendar day,
-- week (Sunday start) and month, in p_tz. A run that never started (failed
-- to launch, or refused at the limit) doesn't count.
create or replace function sourcing.search_usage(
  p_tenant text,
  p_tz text default 'Africa/Cairo'
)
returns table (
  period text,
  starts_at timestamptz,
  resets_at timestamptz,
  searches int,
  spend_usd numeric
)
language sql
stable
set search_path = ''
as $$
  with local_now as (
    select now() at time zone p_tz as t
  ),
  windows as (
    select 'day' as period,
           date_trunc('day', t) as s,
           date_trunc('day', t) + interval '1 day' as e
      from local_now
    union all
    select 'week',
           date_trunc('week', t + interval '1 day') - interval '1 day',
           date_trunc('week', t + interval '1 day') + interval '6 days'
      from local_now
    union all
    select 'month',
           date_trunc('month', t),
           date_trunc('month', t) + interval '1 month'
      from local_now
  )
  select w.period,
         w.s at time zone p_tz,
         w.e at time zone p_tz,
         (select count(*)::int
            from sourcing.search_runs r
           where r.tenant_key = p_tenant
             and r.created_at >= w.s at time zone p_tz
             and not (r.status in ('error', 'cancelled') and r.started_at is null)),
         (select coalesce(sum(c.cost_usd), 0)
            from sourcing.provider_calls c
           where c.tenant_key = p_tenant
             and c.created_at >= w.s at time zone p_tz)
    from windows w;
$$;
