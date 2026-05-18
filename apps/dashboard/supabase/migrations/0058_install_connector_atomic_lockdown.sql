-- Phase K install-flow follow-up: lock down install_connector_atomic.
--
-- Codex P1 on PR #24: 0057 granted execute to `authenticated`, which combined
-- with SECURITY DEFINER and the in-function comment "trusts its inputs" let any
-- signed-in user call the RPC directly via the Supabase client and install or
-- revoke connectors for ANY tenant. Tenant-isolation hole.
--
-- Server actions and the OAuth callback both use the service-role client
-- (getSupabaseServiceClient), so removing the `authenticated` grant breaks
-- nothing in our own code paths. Defense-in-depth: also assert the actor is a
-- tenant admin inside the function body, so even a future caller with elevated
-- privileges still can't fabricate an install for an arbitrary tenant.

revoke execute on function public.install_connector_atomic(
  uuid, uuid, text, text, public.external_account_kind,
  bytea, bytea, bytea, bytea, bytea, bytea,
  timestamptz, text[], text, jsonb
) from authenticated;

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
  -- Defense-in-depth admin check. The grant is service-role-only now, but if
  -- a future code path ever calls this from a non-service identity, the in-
  -- function check still enforces tenant-admin authority over the target row.
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant_id
      and user_id   = p_actor_user_id
      and role      = 'admin'
  ) then
    raise exception 'install_connector_atomic: actor % is not admin of tenant %', p_actor_user_id, p_tenant_id
      using errcode = '42501';
  end if;

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

-- Re-assert: revoke broadly, then NO public/authenticated grant. The function
-- is callable only by service_role (which has bypass-RLS-and-grants by default
-- in Supabase) — i.e., from our server actions and OAuth callback.
revoke execute on function public.install_connector_atomic(
  uuid, uuid, text, text, public.external_account_kind,
  bytea, bytea, bytea, bytea, bytea, bytea,
  timestamptz, text[], text, jsonb
) from public, anon, authenticated;

notify pgrst, 'reload schema';
