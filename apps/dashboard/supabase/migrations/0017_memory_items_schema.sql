-- 0017_memory_items_schema.sql
-- Phase H: convert memory_files from generic markdown to typed memory items.
--
-- Adds first-class type/title/slug/status columns plus jsonb fields and body_blocks
-- per design doc §7. The existing content+frontmatter columns are kept until the
-- 0020 cleanup migration so callers can be migrated incrementally.

-- 1. Enums
do $$ begin
  create type memory_type as enum (
    'voice', 'decision', 'glossary', 'vendor', 'product', 'team', 'skill'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type memory_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

-- 2. New columns on memory_files (nullable for now; backfill in 0019)
alter table public.memory_files
  add column if not exists type        memory_type,
  add column if not exists title       text,
  add column if not exists slug        text,
  add column if not exists status      memory_status not null default 'draft',
  add column if not exists fields      jsonb         not null default '{}'::jsonb,
  add column if not exists body_blocks jsonb         not null default '[]'::jsonb;

-- 3. Slug uniqueness within (tenant_id, type)
create unique index if not exists memory_files_tenant_type_slug_uq
  on public.memory_files (tenant_id, type, slug)
  where slug is not null and type is not null;

-- 4. Type-filtered query index (the "what's our voice?" deterministic path)
create index if not exists memory_files_tenant_type_status_idx
  on public.memory_files (tenant_id, type, status);
