-- Phase 1 Part B migration 0003: tenant model
-- Adds tenants + tenant_members + role enum + auth_tenant() helper.
-- Per ADR-0004 + memory/tech/repo-structure.md.

create type public.tenant_role as enum ('admin', 'member', 'viewer');

-- Tenants: one row per signed-up team. Slug is URL-safe, used in subdomains
-- and invitation URLs. Plan is opaque text now; Phase 8 (billing) gives it shape.
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null check (slug ~ '^[a-z][a-z0-9-]{2,62}$'),
  name        text not null,
  plan        text not null default 'free',
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);
alter table public.tenants enable row level security;

-- Tenant membership: many-to-many between users and tenants.
-- Composite PK = (tenant_id, user_id), so a user can be in multiple tenants
-- but only once per tenant. Role gates write actions in app code (Phase 5).
create table public.tenant_members (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.tenant_role not null default 'member',
  joined_at   timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
alter table public.tenant_members enable row level security;

create index tenant_members_user_idx on public.tenant_members(user_id);

-- Helper: avoid the tenant_members-policy-on-tenant_members recursion trap.
-- Used by RLS policies on tenants and tenant_members; revoked from anon/authenticated
-- so it cannot be invoked directly via PostgREST.
create or replace function public.is_member_of(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(
    select 1 from public.tenant_members
    where tenant_id = p_tenant_id and user_id = auth.uid()
  )
$$;
revoke execute on function public.is_member_of(uuid) from public, anon, authenticated;

-- auth_tenant(): returns the user's "current" tenant.
-- For Phase 1 (single-tenant-per-user UX), this is just the first one they
-- joined. Phase 6+ may extend this with an explicit X-Tenant header or
-- a JWT claim set during sign-in.
create or replace function public.auth_tenant()
returns uuid
language sql
stable
security invoker
set search_path = public, auth
as $$
  select tenant_id
  from public.tenant_members
  where user_id = auth.uid()
  order by joined_at asc
  limit 1
$$;

-- RLS — tenants
create policy tenants_member_read on public.tenants
  for select using (public.is_member_of(id));

-- RLS — tenant_members
create policy tenant_members_self_read on public.tenant_members
  for select using (user_id = auth.uid() or public.is_member_of(tenant_id));

-- Writes on tenants/tenant_members are service_role only for Phase 1.
-- Admin-via-app invitations land in Phase 5 (RBAC).
