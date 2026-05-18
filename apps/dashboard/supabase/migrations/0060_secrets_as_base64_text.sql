-- P0 mid-smoke fix on PR #25: secrets round-trip never worked.
--
-- Symptom: install + BYOK looked successful (rows landed, UI flipped to
-- "installed") but secrets could never be retrieved. tenant-keys.ts caught the
-- "iv must be 12 bytes" throw and silently fell through to the hosted-demo
-- env key. Live for ~2 weeks, found mid-PR-#25 smoke 2026-05-18.
--
-- Root cause: Supabase JS client `JSON.stringify`s rpc()/insert() params.
-- `Buffer.toJSON()` returns `{"type":"Buffer","data":[byte,byte,...]}`. PostgREST
-- received that JSON, found a bytea target column, and stored the JSON-string
-- bytes literally. Live row's `secret_iv` was 69 bytes (the JSON text) instead
-- of the pinned 12 bytes. Verified empirically on staging:
--   octet_length(secret_iv) = 69
--   substring(secret_iv from 1 for 80)::text =
--     '{"type":"Buffer","data":[60,101,85,35,64,225,105,225,134,194,33,233]}'
--
-- Fix: store base64 strings in TEXT columns. Buffer.toString('base64')
-- round-trips through JSON.stringify without any object wrapping. Encryption
-- itself is unchanged — AES-256-GCM, 12-byte IV, 16-byte tag — only the
-- on-the-wire and at-rest encoding changes. The base64 IS the storage form;
-- no SQL-side decode required.
--
-- Existing data: the 2 active rows in production are both demo/smoke
-- artifacts containing the broken JSON-Buffer format. They cannot be
-- migrated to anything decryptable (the embedded byte arrays would round-
-- trip as base64 strings of the JSON text, not of the actual ciphertext
-- bytes). Hard-revoke them; the owners will re-enter their keys.

-- 1) Hard-delete unrecoverable rows. Every existing external_accounts row
--    with octet_length(secret_iv) != 12 has the JSON-Buffer corruption and
--    no chance of decryption. There are no FKs from any other table into
--    external_accounts, but tenant_connectors carries an
--    external_account_id pointer we should null/delete so the index doesn't
--    keep a dangling reference. Use ON DELETE behavior: just null out the
--    pointer and mark the connector inactive — owners can reinstall.
update public.tenant_connectors
   set external_account_id = null,
       active              = false,
       uninstalled_at      = now()
 where external_account_id in (
   select id from public.external_accounts
   where octet_length(secret_iv) <> 12
 );

delete from public.external_accounts
 where octet_length(secret_iv) <> 12;

-- 2) Convert external_accounts secret columns to TEXT. The remaining rows
--    (if any) had valid 12-byte IVs which is impossible under the broken
--    wire format, so post-DELETE the table is effectively empty of secret
--    rows and the USING clause never has to manufacture text from garbage.
alter table public.external_accounts
  alter column secret_ciphertext  type text using encode(secret_ciphertext, 'base64'),
  alter column secret_iv          type text using encode(secret_iv,         'base64'),
  alter column secret_tag         type text using encode(secret_tag,        'base64'),
  alter column refresh_ciphertext type text using encode(refresh_ciphertext, 'base64'),
  alter column refresh_iv         type text using encode(refresh_iv,         'base64'),
  alter column refresh_tag        type text using encode(refresh_tag,        'base64');

comment on column public.external_accounts.secret_ciphertext is
  'AES-256-GCM ciphertext, base64. Decode with Buffer.from(col, "base64"). See lib/secrets/encryption.ts (fromWireSecret).';
comment on column public.external_accounts.secret_iv is
  'AES-256-GCM IV (12 bytes raw → ~16 char base64).';
comment on column public.external_accounts.secret_tag is
  'AES-256-GCM auth tag (16 bytes raw → ~24 char base64).';

-- 3) Convert tenant_connectors webhook secret columns to TEXT (same reason;
--    no live writer yet, but keep the schema consistent so a future writer
--    can't fall into the same trap). These columns are nullable so the
--    USING expression is allowed to produce nulls for any extant rows.
alter table public.tenant_connectors
  alter column webhook_secret_ciphertext type text using encode(webhook_secret_ciphertext, 'base64'),
  alter column webhook_secret_iv         type text using encode(webhook_secret_iv,         'base64'),
  alter column webhook_secret_tag        type text using encode(webhook_secret_tag,        'base64');

-- 4) Recreate install_connector_atomic with TEXT params. Function body
--    unchanged from 0058 except the parameter types. The in-function admin
--    check from 0058 stays; the explicit service_role grant from 0059 is
--    re-applied at the bottom of this migration.

drop function if exists public.install_connector_atomic(
  uuid, uuid, text, text, public.external_account_kind,
  bytea, bytea, bytea, bytea, bytea, bytea,
  timestamptz, text[], text, jsonb
);

create or replace function public.install_connector_atomic(
  p_tenant_id          uuid,
  p_actor_user_id      uuid,
  p_connector_id       text,
  p_provider_id        text,
  p_kind               public.external_account_kind,
  p_secret_ciphertext  text,
  p_secret_iv          text,
  p_secret_tag         text,
  p_refresh_ciphertext text,
  p_refresh_iv         text,
  p_refresh_tag        text,
  p_expires_at         timestamptz,
  p_granted_scopes     text[],
  p_display_hint       text,
  p_mapping            jsonb
) returns table (external_account_id uuid, tenant_connector_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_ext_id   uuid;
  v_conn_id  uuid;
begin
  -- Defense-in-depth admin check. Same as 0058.
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant_id
      and user_id   = p_actor_user_id
      and role      = 'admin'
  ) then
    raise exception 'install_connector_atomic: actor % is not admin of tenant %', p_actor_user_id, p_tenant_id
      using errcode = '42501';
  end if;

  update public.external_accounts
    set status = 'revoked', revoked_at = now()
    where tenant_id = p_tenant_id
      and provider_id = p_provider_id
      and kind = p_kind
      and status = 'active';

  insert into public.external_accounts (
    tenant_id, provider_id, kind,
    secret_ciphertext, secret_iv, secret_tag,
    refresh_ciphertext, refresh_iv, refresh_tag,
    expires_at, granted_scopes, display_hint,
    status, created_by
  ) values (
    p_tenant_id, p_provider_id, p_kind,
    p_secret_ciphertext, p_secret_iv, p_secret_tag,
    p_refresh_ciphertext, p_refresh_iv, p_refresh_tag,
    p_expires_at, p_granted_scopes, p_display_hint,
    'active', p_actor_user_id
  ) returning id into v_ext_id;

  insert into public.tenant_connectors (
    tenant_id, connector_id, external_account_id, mapping, installed_by, active, installed_at
  ) values (
    p_tenant_id, p_connector_id, v_ext_id, p_mapping, p_actor_user_id, true, now()
  )
  on conflict (tenant_id, connector_id) where active
  do update set
    external_account_id = excluded.external_account_id,
    mapping             = excluded.mapping,
    installed_by        = excluded.installed_by,
    installed_at        = now(),
    last_sync_at        = null,
    last_sync_status    = null,
    last_sync_error     = null,
    uninstalled_at      = null
  returning id into v_conn_id;

  return query select v_ext_id, v_conn_id;
end;
$$;

-- 5) Re-apply the 0058 lockdown + 0059 explicit service_role grant against
--    the new TEXT signature.
revoke execute on function public.install_connector_atomic(
  uuid, uuid, text, text, public.external_account_kind,
  text, text, text, text, text, text,
  timestamptz, text[], text, jsonb
) from public, anon, authenticated;

grant execute on function public.install_connector_atomic(
  uuid, uuid, text, text, public.external_account_kind,
  text, text, text, text, text, text,
  timestamptz, text[], text, jsonb
) to service_role;

notify pgrst, 'reload schema';
