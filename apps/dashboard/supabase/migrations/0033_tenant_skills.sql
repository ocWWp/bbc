-- v1.5 launch plan D-W1-2 (2/5): tenant_skills.
--
-- Records every skill (built-in + imported) installed in a tenant. The 5
-- built-in studio templates are surfaced as synthetic rows with
-- source_kind='builtin' by the read layer; the table itself stores only
-- explicitly-installed skills.
--
-- Versioning: re-importing the same skill_name with a different source_commit
-- soft-deletes the old row (sets uninstalled_at) and inserts a new one.
-- The partial unique index ensures at most one active row per (tenant, name).
--
-- RLS pattern: member read + member-self write (matches ingestion_sources,
-- studio_runs, external_accounts). Admin-gate for INSTALL is enforced at the
-- server-action layer via requireRole(actor, 'admin').
--
-- Spec: docs/plans/2026-05-12-bbc-launch-design.md §3
-- ADR:  memory/decisions/0011-skill-md-bbc-spec.md

create table public.tenant_skills (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  source_kind     text not null check (source_kind in ('builtin', 'github', 'manual')),
  source_url      text,
  source_commit   text,
  skill_name      text not null,
  skill_role      text not null check (skill_role in ('marketing', 'founder', 'engineering', 'designer', 'support')),
  manifest        jsonb not null,
  body            text not null,
  body_hash       text not null,
  installed_at    timestamptz not null default now(),
  installed_by    uuid not null references auth.users(id),
  uninstalled_at  timestamptz,
  active          boolean not null generated always as (uninstalled_at is null) stored
);

create unique index tenant_skills_active_unique_idx
  on public.tenant_skills (tenant_id, skill_name)
  where active;

create index tenant_skills_role_idx
  on public.tenant_skills (tenant_id, skill_role)
  where active;

alter table public.tenant_skills enable row level security;

create policy tenant_skills_member_read on public.tenant_skills
  for select using (public.is_member_of(tenant_id));

create policy tenant_skills_member_insert on public.tenant_skills
  for insert with check (
    public.is_member_of(tenant_id) and installed_by = auth.uid()
  );

create policy tenant_skills_member_update on public.tenant_skills
  for update using (
    public.is_member_of(tenant_id) and installed_by = auth.uid()
  );
