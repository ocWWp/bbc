-- Applied: 2026-05-08 via mcp__supabase__apply_migration to project gpmtkhyczbapnfquhswn
-- Bug fix: the BEFORE INSERT trigger from 0001 tried to insert into profiles,
-- but auth.users.id doesn't exist yet at that point, so the FK
-- profiles.user_id -> auth.users.id failed with code 23503.
-- Split into:
--   - BEFORE INSERT: allowlist check only (raises not_invited).
--   - AFTER INSERT:  populate profiles.

drop trigger if exists enforce_allowlist_before_insert on auth.users;
drop function if exists public.enforce_allowlist();

create or replace function public.check_allowlist()
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

  return new;
end
$$;

create or replace function public.create_profile_for_user()
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

revoke execute on function public.check_allowlist() from public, anon, authenticated;
revoke execute on function public.create_profile_for_user() from public, anon, authenticated;

create trigger check_allowlist_before_insert
  before insert on auth.users
  for each row execute function public.check_allowlist();

create trigger create_profile_after_insert
  after insert on auth.users
  for each row execute function public.create_profile_for_user();
