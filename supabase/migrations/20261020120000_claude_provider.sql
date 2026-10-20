-- AI moves from OpenAI to Claude ('anthropic'); embeddings move to
-- Supabase's built-in gte-small model ('supabase'). 'openai' stays allowed
-- so the existing call history remains valid.
alter table sourcing.provider_calls
  drop constraint provider_calls_provider_check;
alter table sourcing.provider_calls
  add constraint provider_calls_provider_check check (
    provider in (
      'openai', 'anthropic', 'supabase',
      'serper', 'serpapi', 'exa', 'apify', 'harvestapi'
    )
  );
