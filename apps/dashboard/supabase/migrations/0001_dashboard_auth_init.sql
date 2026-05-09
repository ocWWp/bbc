-- Applied: 2026-05-08 via mcp__supabase__apply_migration to project gpmtkhyczbapnfquhswn
-- Purpose: invite-only Supabase Auth for the BBC dashboard.

-- Allowlist: invite-only gate, keyed on (provider, identifier).
create table public.allowlist (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null check (provider in ('github','google','email')),
  identifier  text not null,
  note        text,
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (provider, identifier)
);
alter table public.allowlist enable row level security;
create policy allowlist_authenticated_read on public.allowlist
  for select using (auth.role() = 'authenticated');
-- writes: service_role only (no policy -> denied for anon/authenticated)

-- Profiles: 1:1 with auth.users, captures actor metadata.
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  provider     text not null,
  identifier   text not null,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_self_read on public.profiles
  for select using (auth.uid() = user_id);

-- Enforcement: BEFORE INSERT trigger on auth.users.
-- Belt-and-suspenders: even if middleware is bypassed, the DB rejects non-allowlisted signups.
create or replace function public.enforce_allowlist()
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
    select 1 from public.allowlist
    where provider = v_provider and identifier = v_identifier
  ) then
    raise exception 'not_invited' using errcode = 'P0001';
  end if;

  insert into public.profiles (user_id, provider, identifier, display_name, avatar_url)
  values (
    new.id,
    v_provider,
    v_identifier,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );

  return new;
end
$$;

create trigger enforce_allowlist_before_insert
  before insert on auth.users
  for each row execute function public.enforce_allowlist();
