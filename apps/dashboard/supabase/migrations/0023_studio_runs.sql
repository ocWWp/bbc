-- Phase J migration 0023: studio_runs
-- One row per Marketing Studio workflow execution. Output is content, not
-- memory -- this table is the queue of generated drafts awaiting approval,
-- distinct from memory_files (which holds the brain) and ingestion_sources
-- (which holds what fed the brain).
--
-- cited_memory_ids[] is a soft reference -- memory may be deleted between
-- run and review, in which case the UI handles the dangling chip gracefully.
-- Not a real FK on purpose. See docs/plans/2026-05-11-phase-j-marketing-studio.md
-- and ADR-0006.

do $$ begin
  create type public.studio_run_status as enum (
    'running', 'pending_review', 'accepted', 'rejected', 'error'
  );
exception when duplicate_object then null; end $$;

create table public.studio_runs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  created_by        uuid not null references auth.users(id),
  template_id       text not null,
  task              text not null,
  inputs            jsonb not null default '{}'::jsonb,
  output_blocks     jsonb not null default '[]'::jsonb,
  cited_memory_ids  uuid[] not null default '{}',
  status            public.studio_run_status not null default 'running',
  error_message     text,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);
alter table public.studio_runs enable row level security;

create index studio_runs_tenant_created_idx
  on public.studio_runs (tenant_id, created_at desc);

create index studio_runs_tenant_template_idx
  on public.studio_runs (tenant_id, template_id, created_at desc);

create policy studio_runs_member_read on public.studio_runs
  for select using (public.is_member_of(tenant_id));

create policy studio_runs_member_insert on public.studio_runs
  for insert with check (
    public.is_member_of(tenant_id) and created_by = auth.uid()
  );

create policy studio_runs_member_update on public.studio_runs
  for update using (
    public.is_member_of(tenant_id) and created_by = auth.uid()
  );
