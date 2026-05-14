-- Phase L1.2: provider_adapters catalog for DB-mode tools.
--
-- File-mode reads the role-tool-bundle catalog from memory/ops/providers/*.yaml.
-- DB-mode reads from this table. Rows with tenant_id IS NULL are the global
-- seed catalog (mirrors the YAMLs in the BBC repo); rows with tenant_id set
-- are tenant-specific additions (e.g., a tenant registers their own
-- self-hosted vLLM endpoint).
--
-- The `bindings` table (migration 0007) already holds each tenant's
-- role->provider mapping; this table is the provider side of that join.
-- LocalToolsStore + SupabaseToolsStore share the `ToolsStore` interface;
-- this migration is the DB binding for it. See ADR-0004 and
-- packages/store/src/supabase/tools.ts.

create table public.provider_adapters (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants(id) on delete cascade,
  provider_id   text not null,
  implements    text[] not null default '{}',
  status        text not null default 'candidate',
  metadata      jsonb not null default '{}'::jsonb,
  tags          text[] not null default '{}',
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint provider_adapters_status_check
    check (status in ('active', 'candidate', 'archived', 'unknown')),
  -- One global row per provider_id; one tenant-specific row per provider_id
  -- per tenant. NULLS NOT DISTINCT treats two NULL tenant_id rows as a clash.
  unique nulls not distinct (tenant_id, provider_id)
);

alter table public.provider_adapters enable row level security;

create index provider_adapters_tenant_idx
  on public.provider_adapters (tenant_id, status);

create index provider_adapters_implements_gin
  on public.provider_adapters using gin (implements);

-- Tenants see the global catalog + their own additions.
create policy provider_adapters_read on public.provider_adapters
  for select using (
    tenant_id is null
    or public.is_member_of(tenant_id)
  );

-- Tenants can only write their own rows; globals are seeded below and
-- updated only via service role / future sync job.
create policy provider_adapters_member_insert on public.provider_adapters
  for insert with check (
    tenant_id is not null
    and public.is_member_of(tenant_id)
    and created_by = auth.uid()
  );

create policy provider_adapters_member_update on public.provider_adapters
  for update using (
    tenant_id is not null
    and public.is_member_of(tenant_id)
    and created_by = auth.uid()
  );

create policy provider_adapters_member_delete on public.provider_adapters
  for delete using (
    tenant_id is not null
    and public.is_member_of(tenant_id)
    and created_by = auth.uid()
  );

-- Seed the global catalog. Mirrors memory/ops/providers/*.yaml as of Phase L1.
-- Re-running this migration in dev is idempotent thanks to the unique constraint.
insert into public.provider_adapters (provider_id, implements, status, metadata, tags) values
  ('anthropic-claude-sonnet', array['llm-provider'], 'active',
    jsonb_build_object('model_id', 'claude-sonnet-4-6', 'access_method', 'api-key'),
    array['llm','anthropic']),
  ('supabase', array['db-provider','auth-provider'], 'active',
    jsonb_build_object('access_method', 'postgrest'),
    array['db','supabase']),
  ('cloudflare-workers', array['hosting-provider'], 'active',
    jsonb_build_object('access_method', 'wrangler'),
    array['hosting','cloudflare']),
  ('resend', array['email-delivery'], 'candidate',
    jsonb_build_object('access_method', 'api-key'),
    array['email']),
  ('posthog', array['analytics-provider'], 'candidate',
    jsonb_build_object('access_method', 'api-key'),
    array['analytics']),
  ('revenuecat', array['billing-provider'], 'candidate',
    jsonb_build_object('access_method', 'api-key'),
    array['billing']),
  ('figma', array['design-tool'], 'candidate',
    jsonb_build_object('access_method', 'oauth'),
    array['design']),
  ('railway', array['hosting-provider'], 'candidate',
    jsonb_build_object('access_method', 'cli'),
    array['hosting'])
on conflict (tenant_id, provider_id) do nothing;
