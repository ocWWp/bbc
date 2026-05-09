-- Phase 6 migration 0013: api_keys for the MCP server
-- Per-tenant API keys. Format presented to user once: bbc_<key_id>.<secret>.
-- Only the bcrypt hash of the secret is stored; the plaintext is shown
-- once at creation and never again.

create extension if not exists pgcrypto;

create type public.api_key_scope as enum ('read', 'write', 'admin');

create table public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  key_id        text unique not null,
  secret_hash   text not null,
  scope         public.api_key_scope not null default 'read',
  name          text not null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
alter table public.api_keys enable row level security;

create index api_keys_tenant_idx on public.api_keys(tenant_id, revoked_at);

create policy api_keys_member_read on public.api_keys
  for select using (public.is_member_of(tenant_id));

create or replace function public._compose_api_key(p_key_id text, p_secret text)
returns text language sql immutable as $$
  select 'bbc_' || p_key_id || '.' || p_secret
$$;
revoke execute on function public._compose_api_key(text, text) from public, anon, authenticated;

-- Note: pgcrypto lives in `extensions` schema on Supabase, so
-- search_path must include it for gen_random_bytes / crypt / gen_salt.
create or replace function public.create_api_key(
  p_name text,
  p_scope public.api_key_scope default 'read'
)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_caller record;
  v_key_id text;
  v_secret text;
  v_hash   text;
  v_token  text;
  v_v      bigint;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_input: name required' using errcode = 'P0006';
  end if;
  select * into v_caller from public._require_admin();
  v_key_id := lower(substring(translate(encode(gen_random_bytes(8), 'base64'), '+/=', 'xy_') from 1 for 12));
  v_secret := encode(gen_random_bytes(32), 'hex');
  v_hash   := crypt(v_secret, gen_salt('bf', 10));
  insert into public.api_keys (tenant_id, key_id, secret_hash, scope, name, created_by)
    values (v_caller.out_tenant_id, v_key_id, v_hash, p_scope, p_name, v_caller.out_user_id);
  v_token := public._compose_api_key(v_key_id, v_secret);
  select coalesce(max(v), 0) + 1 into v_v from public.operations_log where tenant_id = v_caller.out_tenant_id;
  insert into public.operations_log (tenant_id, v, actor, action, target, payload)
    values (v_caller.out_tenant_id, v_v, v_caller.out_actor, 'create_api_key', v_key_id,
      jsonb_build_object('name', p_name, 'scope', p_scope::text, 'key_id', v_key_id));
  return v_token;
end
$$;
revoke execute on function public.create_api_key(text, public.api_key_scope) from public, anon;
grant execute on function public.create_api_key(text, public.api_key_scope) to authenticated;

create or replace function public.revoke_api_key(p_key_id text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller record;
  v_key public.api_keys%rowtype;
  v_v bigint;
begin
  select * into v_caller from public._require_admin();
  select * into v_key from public.api_keys
    where key_id = p_key_id and tenant_id = v_caller.out_tenant_id;
  if v_key.id is null then
    raise exception 'not_found: api key does not exist' using errcode = 'P0004';
  end if;
  if v_key.revoked_at is not null then return; end if;
  update public.api_keys set revoked_at = now() where id = v_key.id;
  select coalesce(max(v), 0) + 1 into v_v from public.operations_log where tenant_id = v_caller.out_tenant_id;
  insert into public.operations_log (tenant_id, v, actor, action, target, payload)
    values (v_caller.out_tenant_id, v_v, v_caller.out_actor, 'revoke_api_key', p_key_id,
      jsonb_build_object('key_id', p_key_id, 'name', v_key.name));
end
$$;
revoke execute on function public.revoke_api_key(text) from public, anon;
grant execute on function public.revoke_api_key(text) to authenticated;

-- Server-side helper: validate a presented token, return tenant + scope + key_id.
-- service_role only — the MCP server uses it directly via service-role connection.
create or replace function public.resolve_api_key(p_token text)
returns table(out_tenant_id uuid, out_scope public.api_key_scope, out_key_id text)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_parts text[];
  v_key_id text;
  v_secret text;
  v_row public.api_keys%rowtype;
begin
  if p_token is null or position('bbc_' in p_token) <> 1 then
    raise exception 'invalid_input: malformed token' using errcode = 'P0006';
  end if;
  v_parts := string_to_array(substring(p_token from 5), '.');
  if array_length(v_parts, 1) <> 2 then
    raise exception 'invalid_input: malformed token' using errcode = 'P0006';
  end if;
  v_key_id := v_parts[1];
  v_secret := v_parts[2];
  select * into v_row from public.api_keys where key_id = v_key_id and revoked_at is null;
  if v_row.id is null then
    raise exception 'unauthorized: invalid or revoked key' using errcode = 'P0002';
  end if;
  if v_row.secret_hash <> crypt(v_secret, v_row.secret_hash) then
    raise exception 'unauthorized: invalid or revoked key' using errcode = 'P0002';
  end if;
  update public.api_keys set last_used_at = now() where id = v_row.id;
  out_tenant_id := v_row.tenant_id;
  out_scope := v_row.scope;
  out_key_id := v_row.key_id;
  return next;
end
$$;
revoke execute on function public.resolve_api_key(text) from public, anon, authenticated;
