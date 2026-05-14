-- v1.5 launch plan D-W1-2 (3/5): tenant_connectors.
--
-- State + config for installed connectors (Notion, GitHub, Linear, Webhook,
-- Gmail, Drive). Credentials live in external_accounts; this table holds:
--   - the link to that external_account (composite FK enforces tenant-consistency)
--   - mapping config (JSON)
--   - sync_state (JSON cursor for incremental syncs)
--   - last sync status / error
--   - webhook-only secret material (for the generic webhook connector)
--
-- The composite FK (tenant_id, external_account_id) -> external_accounts is the
-- safety net: it prevents a server-side bug from accidentally attaching another
-- tenant's OAuth token to this tenant's connector row. Requires the unique
-- index on external_accounts(tenant_id, id) from migration 0032.
--
-- Webhook secret triple (ciphertext + iv + tag) follows the same AES-256-GCM
-- convention as external_accounts.secret_*; encrypted with BBC_SECRET_ENCRYPTION_KEY.
--
-- Spec: docs/plans/2026-05-12-bbc-launch-design.md §4

create table public.tenant_connectors (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants(id) on delete cascade,
  connector_id              text not null,
  external_account_id       uuid,
  mapping                   jsonb not null default '{}'::jsonb,
  sync_state                jsonb not null default '{}'::jsonb,
  webhook_secret_ciphertext bytea,
  webhook_secret_iv         bytea,
  webhook_secret_tag        bytea,
  last_sync_at              timestamptz,
  last_sync_status          text check (last_sync_status in ('ok', 'error', 'partial', 'auth_expired', 'rate_limited')),
  last_sync_error           text,
  active                    boolean not null default true,
  installed_at              timestamptz not null default now(),
  installed_by              uuid not null references auth.users(id),
  uninstalled_at            timestamptz,
  foreign key (tenant_id, external_account_id)
    references public.external_accounts (tenant_id, id) on delete restrict
);

create unique index tenant_connectors_active_unique_idx
  on public.tenant_connectors (tenant_id, connector_id)
  where active;

create index tenant_connectors_tenant_status_idx
  on public.tenant_connectors (tenant_id, last_sync_status)
  where active;

alter table public.tenant_connectors enable row level security;

create policy tenant_connectors_member_read on public.tenant_connectors
  for select using (public.is_member_of(tenant_id));

create policy tenant_connectors_member_insert on public.tenant_connectors
  for insert with check (
    public.is_member_of(tenant_id) and installed_by = auth.uid()
  );

create policy tenant_connectors_member_update on public.tenant_connectors
  for update using (
    public.is_member_of(tenant_id) and installed_by = auth.uid()
  );
