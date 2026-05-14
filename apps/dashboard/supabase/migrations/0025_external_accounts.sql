-- Phase K migration 0025: external_accounts
-- Per-tenant encrypted storage for user-provided provider secrets (BYOK).
-- Examples: Anthropic API key, OpenAI API key, Resend key, Higgsfield key,
-- a future OAuth refresh token from Notion / GitHub / Linear.
--
-- Secrets are encrypted with AES-256-GCM using BBC_SECRET_ENCRYPTION_KEY
-- before insert; the DB never sees plaintext. The encryption helpers live
-- at apps/dashboard/src/lib/secrets/encryption.ts.
--
-- Per ADR-0007: BBC is OSS, no monetization layer in v1. external_accounts
-- holds user-provided secrets only; the maintainer never manages provider
-- accounts on behalf of users. The original Phase K marketplace concept
-- (BBC-provisioned credentials) is explicitly out of scope.

do $$ begin
  create type public.external_account_status as enum ('active', 'revoked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.external_account_kind as enum (
    'api_key',
    'oauth_token',
    'connection_string'
  );
exception when duplicate_object then null; end $$;

create table public.external_accounts (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  provider_id         text not null,
  kind                public.external_account_kind not null,
  secret_ciphertext   bytea not null,
  secret_iv           bytea not null,
  secret_tag          bytea not null,
  display_hint        text not null default '',
  status              public.external_account_status not null default 'active',
  created_by          uuid not null references auth.users(id),
  created_at          timestamptz not null default now(),
  revoked_at          timestamptz
);
alter table public.external_accounts enable row level security;

-- One active row per (tenant, provider, kind). Replacing a key revokes the
-- previous active row and inserts a new one -- never two actives at once.
create unique index external_accounts_active_unique_idx
  on public.external_accounts (tenant_id, provider_id, kind)
  where status = 'active';

create index external_accounts_tenant_idx
  on public.external_accounts (tenant_id, status);

create policy external_accounts_member_read on public.external_accounts
  for select using (public.is_member_of(tenant_id));

create policy external_accounts_member_insert on public.external_accounts
  for insert with check (
    public.is_member_of(tenant_id) and created_by = auth.uid()
  );

create policy external_accounts_member_update on public.external_accounts
  for update using (
    public.is_member_of(tenant_id) and created_by = auth.uid()
  );

comment on table public.external_accounts is
  'BYOK secrets per tenant. Ciphertext columns are AES-256-GCM; plaintext only ever exists in server-side decryption helpers, never returned to clients. See ADR-0007.';
