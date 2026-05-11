-- 0018_memory_relations.sql
-- Phase H: explicit typed edges between memory items (Tana-style).
--
-- See design doc §7 for relation kinds and §8 for how the brain map consumes this.

do $$ begin
  create type memory_relation_kind as enum (
    'cites', 'supersedes', 'implements', 'exemplifies', 'owned_by'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.memory_relations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  src_id      uuid not null references public.memory_files(id) on delete cascade,
  dst_id      uuid not null references public.memory_files(id) on delete cascade,
  kind        memory_relation_kind not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  unique (tenant_id, src_id, dst_id, kind),
  check (src_id <> dst_id)
);

create index if not exists memory_relations_tenant_src_idx
  on public.memory_relations (tenant_id, src_id);
create index if not exists memory_relations_tenant_dst_idx
  on public.memory_relations (tenant_id, dst_id);

alter table public.memory_relations enable row level security;

create policy memory_relations_tenant_read on public.memory_relations
  for select using (public.is_member_of(tenant_id));

create policy memory_relations_tenant_insert on public.memory_relations
  for insert with check (public.is_member_of(tenant_id));

create policy memory_relations_tenant_delete on public.memory_relations
  for delete using (public.is_member_of(tenant_id));
