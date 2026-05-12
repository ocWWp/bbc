-- Phase L+ follow-up: per-role MCP scope.
--
-- Today api_keys carry only a tenant_id + scope (read/write/admin). The role
-- column adds a second axis: keys can optionally be bound to a role string
-- ("marketing-writer", "engineering-reviewer", "founder", "designer"). When
-- set, the MCP server filters brain reads to the memory types relevant to
-- that role. NULL means "all types" (current behavior).
--
-- The catalog of role->types lives in code (src/lib/api-auth.ts) rather than
-- in a DB table — it's a small, slow-changing rule set tightly coupled to
-- the memory_files type enum. Putting it in code keeps the migration tiny
-- and lets us evolve the mapping without DDL churn.

alter table public.api_keys
  add column if not exists role text;

-- DROP + CREATE rather than CREATE OR REPLACE because Postgres won't let
-- CREATE OR REPLACE change a function's OUT parameter shape.
drop function if exists public.resolve_api_key(text);

create function public.resolve_api_key(p_token text)
returns table(
  out_tenant_id uuid,
  out_scope public.api_key_scope,
  out_key_id text,
  out_role text
)
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
  out_role := v_row.role;
  return next;
end
$$;
revoke execute on function public.resolve_api_key(text) from public, anon, authenticated;

-- Replace the 2-arg create_api_key with a 3-arg version. The role is a
-- free-form text field; the application layer enforces which strings are
-- recognized (see ROLE_MEMORY_TYPES in src/lib/api-auth.ts). We deliberately
-- keep the DB permissive so new role names roll out without migrations.
-- p_role defaults to null, so existing callers using {p_name, p_scope}
-- continue to work via PostgREST default-parameter handling.
drop function if exists public.create_api_key(text, public.api_key_scope);

create function public.create_api_key(
  p_name text,
  p_scope public.api_key_scope default 'read',
  p_role text default null
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
  insert into public.api_keys (tenant_id, key_id, secret_hash, scope, name, role, created_by)
    values (v_caller.out_tenant_id, v_key_id, v_hash, p_scope, p_name, p_role, v_caller.out_user_id);
  v_token := public._compose_api_key(v_key_id, v_secret);
  select coalesce(max(v), 0) + 1 into v_v from public.operations_log where tenant_id = v_caller.out_tenant_id;
  insert into public.operations_log (tenant_id, v, actor, action, target, payload)
    values (v_caller.out_tenant_id, v_v, v_caller.out_actor, 'create_api_key', v_key_id,
      jsonb_build_object('name', p_name, 'scope', p_scope::text, 'role', p_role, 'key_id', v_key_id));
  return v_token;
end
$$;
revoke execute on function public.create_api_key(text, public.api_key_scope, text) from public, anon;
grant execute on function public.create_api_key(text, public.api_key_scope, text) to authenticated;
