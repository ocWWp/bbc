-- Phase J migration 0024: studio_template_overrides
-- Tenant-scoped customizations to a hand-authored template, created via the
-- conversational "edit this workflow" chat. Each override is one targeted
-- rule that gets merged into the template's prompt at run time.
--
-- We deliberately do NOT use memory_files for this -- overrides are
-- prompt-engineering artifacts, not brain knowledge. They affect HOW the
-- brain is used, not WHAT it contains. See ADR-0006.

do $$ begin
  create type public.studio_override_kind as enum (
    'add_constraint',
    'replace_section',
    'add_example',
    'forbid_pattern'
  );
exception when duplicate_object then null; end $$;

create table public.studio_template_overrides (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  template_id     text not null,
  kind            public.studio_override_kind not null,
  value           jsonb not null,
  summary         text not null default '',
  source_run_id   uuid references public.studio_runs(id) on delete set null,
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  active          boolean not null default true
);
alter table public.studio_template_overrides enable row level security;

create index studio_overrides_tenant_template_active_idx
  on public.studio_template_overrides (tenant_id, template_id, active);

create policy studio_overrides_member_read on public.studio_template_overrides
  for select using (public.is_member_of(tenant_id));

create policy studio_overrides_member_insert on public.studio_template_overrides
  for insert with check (
    public.is_member_of(tenant_id) and created_by = auth.uid()
  );

create policy studio_overrides_member_update on public.studio_template_overrides
  for update using (
    public.is_member_of(tenant_id) and created_by = auth.uid()
  );
