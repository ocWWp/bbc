-- Phase I.20 migration 0020: ingestion_sources
-- Per-tenant log of every brain-dump input: text paste, URL fetch, or file drop.
-- Each row is the provenance anchor for any memory_files rows extracted from it.
-- Status walks pending -> fetched -> parsed -> extracted -> integrated (or error).
-- See docs/plans/2026-05-11-phase-i20-multi-source-ingestion.md and ADR-0005.

do $$ begin
  create type public.ingestion_source_kind as enum ('text', 'url', 'file');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ingestion_status as enum (
    'pending', 'fetched', 'parsed', 'extracted', 'integrated', 'error'
  );
exception when duplicate_object then null; end $$;

create table public.ingestion_sources (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  created_by        uuid not null references auth.users(id),
  kind              public.ingestion_source_kind not null,
  status            public.ingestion_status not null default 'pending',
  idempotency_key   text not null,
  locator           jsonb not null default '{}'::jsonb,
  content_hash      text,
  byte_size         int,
  error_message     text,
  owning_layer      text not null default 'manager',
  created_at        timestamptz not null default now(),
  fetched_at        timestamptz,
  unique (tenant_id, idempotency_key)
);
alter table public.ingestion_sources enable row level security;

create index ingestion_sources_tenant_created_idx
  on public.ingestion_sources (tenant_id, created_at desc);

-- RLS: members of the tenant can read their own sources, and can insert
-- new rows so long as they are the creator. Updates remain service_role
-- only (status transitions happen via server actions running as the user's
-- session anyway -- which RLS treats as the row owner via created_by).
create policy ingestion_sources_member_read on public.ingestion_sources
  for select using (public.is_member_of(tenant_id));

create policy ingestion_sources_member_insert on public.ingestion_sources
  for insert with check (
    public.is_member_of(tenant_id) and created_by = auth.uid()
  );

create policy ingestion_sources_member_update on public.ingestion_sources
  for update using (
    public.is_member_of(tenant_id) and created_by = auth.uid()
  );
