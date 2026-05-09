-- Phase 1 Part B migration 0004: generalize allowlist -> tenant_invitations
-- Migrates the existing 2-row allowlist + 1-row profile + 1 auth user into
-- the tenant model. The existing test user gets a "personal" tenant
-- (slug=zeths-bbc) with admin role; both existing invites are scoped to it.

-- 1. tenant_invitations replaces allowlist as the gate, scoped per-tenant
create table public.tenant_invitations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  provider    text not null check (provider in ('github','google','email')),
  identifier  text not null,
  role        public.tenant_role not null default 'member',
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (tenant_id, provider, identifier)
);
alter table public.tenant_invitations enable row level security;

create index tenant_invitations_lookup_idx
  on public.tenant_invitations (provider, identifier);

create policy tenant_invitations_member_read on public.tenant_invitations
  for select using (public.is_member_of(tenant_id));

-- 2. Add tenant_id to profiles (nullable until backfill)
alter table public.profiles
  add column tenant_id uuid references public.tenants(id) on delete cascade;

-- 3. Bootstrap existing data: tenant + membership + invitation migration
do $$
declare
  v_user_id   uuid;
  v_tenant_id uuid;
begin
  select id into v_user_id from auth.users where email = 'zethtang@gmail.com' limit 1;

  if v_user_id is not null then
    insert into public.tenants (slug, name, plan, created_by)
    values ('zeths-bbc', 'Zeth''s BBC', 'free', v_user_id)
    returning id into v_tenant_id;

    insert into public.tenant_members (tenant_id, user_id, role)
    values (v_tenant_id, v_user_id, 'admin');

    update public.profiles set tenant_id = v_tenant_id where user_id = v_user_id;

    insert into public.tenant_invitations (tenant_id, provider, identifier, role, invited_by)
    select v_tenant_id, provider, identifier, 'admin'::public.tenant_role, v_user_id
    from public.allowlist;
  end if;
end $$;

-- 4. Make profiles.tenant_id NOT NULL now that all rows are backfilled
alter table public.profiles alter column tenant_id set not null;

-- 5. New trigger functions: invitation-based, tenant-aware
create or replace function public.check_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_provider   text;
  v_identifier text;
begin
  v_provider := coalesce(new.raw_app_meta_data->>'provider', 'email');
  if v_provider = 'github' then
    v_identifier := lower(new.raw_user_meta_data->>'user_name');
  else
    v_identifier := lower(new.email);
  end if;

  if v_identifier is null then
    raise exception 'not_invited' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.tenant_invitations
    where provider = v_provider and identifier = v_identifier
  ) then
    raise exception 'not_invited' using errcode = 'P0001';
  end if;

  return new;
end
$$;

create or replace function public.create_profile_and_membership()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_provider   text;
  v_identifier text;
  v_invitation public.tenant_invitations;
begin
  v_provider := coalesce(new.raw_app_meta_data->>'provider', 'email');
  if v_provider = 'github' then
    v_identifier := lower(new.raw_user_meta_data->>'user_name');
  else
    v_identifier := lower(new.email);
  end if;

  select * into v_invitation
  from public.tenant_invitations
  where provider = v_provider and identifier = v_identifier
  order by created_at asc
  limit 1;

  if v_invitation.id is null then
    raise exception 'not_invited' using errcode = 'P0001';
  end if;

  insert into public.profiles (user_id, tenant_id, provider, identifier, display_name, avatar_url)
  values (
    new.id,
    v_invitation.tenant_id,
    v_provider,
    v_identifier,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_invitation.tenant_id, new.id, v_invitation.role)
  on conflict (tenant_id, user_id) do nothing;

  return new;
end
$$;

revoke execute on function public.check_invitation() from public, anon, authenticated;
revoke execute on function public.create_profile_and_membership() from public, anon, authenticated;

-- 6. Swap triggers
drop trigger if exists check_allowlist_before_insert on auth.users;
drop trigger if exists create_profile_after_insert on auth.users;

create trigger check_invitation_before_insert
  before insert on auth.users
  for each row execute function public.check_invitation();

create trigger create_profile_and_membership_after_insert
  after insert on auth.users
  for each row execute function public.create_profile_and_membership();

-- 7. Retire the old functions and the old allowlist table
drop function if exists public.check_allowlist();
drop function if exists public.create_profile_for_user();
drop table if exists public.allowlist;

-- 8. Update profiles RLS to gate by tenant as well as self
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_in_tenant_read on public.profiles
  for select using (user_id = auth.uid() and tenant_id = public.auth_tenant());
