-- Phase K install-flow: transactional connector install.
-- Revokes any prior active external_accounts row for (tenant, provider_id, kind),
-- inserts the new ciphertext, then upserts tenant_connectors. All in one tx so
-- partial failure can't leave orphan rows.
--
-- For Google bundle (gmail + drive from one consent), call this once per scope.
-- Each call is its own tx; the callback should call them sequentially. If the
-- second fails, the first stays installed (idempotent reinstall on retry).
--
-- Conflict target uses the existing `active` partial unique index from 0034
-- (`tenant_connectors_active_unique_idx`). Reinstall re-points the active row;
-- a previously-uninstalled (active=false) row is left alone and a fresh active
-- row is inserted.
--
-- Schema-reality note: the plan (docs/plans/2026-05-17-phase-k-install-flow.md)
-- referenced `last_sync_status != 'uninstalled'` and `updated_at`; both are absent
-- from migration 0034. This RPC uses the real schema: `active` boolean partial
-- index + `installed_at` timestamp. Reinstall also resets `last_sync_*` so /ops
-- honest counts (commits 738f843 + d909446) don't regress on credential refresh.

create or replace function public.install_connector_atomic(
  p_tenant_id          uuid,
  p_actor_user_id      uuid,
  p_connector_id       text,
  p_provider_id        text,
  p_kind               public.external_account_kind,
  p_secret_ciphertext  bytea,
  p_secret_iv          bytea,
  p_secret_tag         bytea,
  p_refresh_ciphertext bytea,
  p_refresh_iv         bytea,
  p_refresh_tag        bytea,
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
  -- Caller-side admin check still required; this function trusts its inputs.

  -- 1. Revoke prior active external_accounts row in the same slot.
  update public.external_accounts
    set status = 'revoked', revoked_at = now()
    where tenant_id = p_tenant_id
      and provider_id = p_provider_id
      and kind = p_kind
      and status = 'active';

  -- 2. Insert the new ciphertext.
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

  -- 3. Upsert tenant_connectors against the existing `active` partial unique index.
  --    Reinstall: re-point external_account_id + mapping on the active row, refresh installed_at/by.
  --    First install (no active row): plain insert.
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

revoke execute on function public.install_connector_atomic(
  uuid, uuid, text, text, public.external_account_kind,
  bytea, bytea, bytea, bytea, bytea, bytea,
  timestamptz, text[], text, jsonb
) from public, anon;

grant execute on function public.install_connector_atomic(
  uuid, uuid, text, text, public.external_account_kind,
  bytea, bytea, bytea, bytea, bytea, bytea,
  timestamptz, text[], text, jsonb
) to authenticated;

notify pgrst, 'reload schema';
