-- Phase I.20 migration 0021: memory_file_sources
-- Many-to-many join: a memory cites N ingestion_sources; a source spawns N memories.
-- tenant_id is denormalized so RLS is a cheap is_member_of() check without a
-- subquery back to the parent memory_files row.

create table public.memory_file_sources (
  memory_id    uuid not null references public.memory_files(id) on delete cascade,
  source_id    uuid not null references public.ingestion_sources(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  locator      jsonb not null default '{}'::jsonb,
  confidence   real,
  created_at   timestamptz not null default now(),
  primary key (memory_id, source_id)
);
alter table public.memory_file_sources enable row level security;

create index memory_file_sources_source_idx on public.memory_file_sources (source_id);
create index memory_file_sources_memory_idx on public.memory_file_sources (memory_id);
create index memory_file_sources_tenant_idx on public.memory_file_sources (tenant_id);

create policy memory_file_sources_member_read on public.memory_file_sources
  for select using (public.is_member_of(tenant_id));

create policy memory_file_sources_member_insert on public.memory_file_sources
  for insert with check (public.is_member_of(tenant_id));
