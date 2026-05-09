-- Phase 2 migration 0005: memory_files
-- Per-tenant storage for memory/**/*.md files. content holds the full
-- file as-written (frontmatter + body); frontmatter is the parsed jsonb
-- mirror for queryable scope/layer/status filters.

create table public.memory_files (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  path          text not null,
  content       text not null,
  frontmatter   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, path)
);
alter table public.memory_files enable row level security;

create index memory_files_tenant_idx on public.memory_files(tenant_id);
create index memory_files_path_idx   on public.memory_files(tenant_id, path);

-- Reads: members can see their tenant's memory.
create policy memory_files_member_read on public.memory_files
  for select using (public.is_member_of(tenant_id));

-- Writes: service_role only for now. Phase 3 adds propose_change()/accept_proposal()
-- SQL functions that will be the only sanctioned write path for owning_layer:main rows.
