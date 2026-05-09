-- Phase 5 migration 0012: team management SQL functions
-- create_invitation, revoke_invitation, change_member_role, remove_member.
-- All admin-gated, atomic, audit-logged. Invoked via supabase.rpc() from
-- /team server actions in the dashboard.
--
-- Note: an earlier draft of this migration named the OUT params of
-- _require_admin() as user_id/tenant_id which collided with column refs
-- inside the function body. Fixed by prefixing OUT params with out_*.

drop function if exists public.create_invitation(text, text, public.tenant_role);
drop function if exists public.revoke_invitation(uuid);
drop function if exists public.change_member_role(uuid, public.tenant_role);
drop function if exists public.remove_member(uuid);
drop function if exists public._require_admin();

create function public._require_admin()
returns table(out_user_id uuid, out_tenant_id uuid, out_actor text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid;
  v_profile public.profiles%rowtype;
  v_role public.tenant_role;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'unauthorized: sign in required' using errcode = 'P0002';
  end if;
  select * into v_profile from public.profiles where user_id = v_user;
  if v_profile.user_id is null then
    raise exception 'unauthorized: missing profile' using errcode = 'P0002';
  end if;
  select role into v_role from public.tenant_members
    where user_id = v_user and tenant_id = v_profile.tenant_id;
  if v_role <> 'admin' then
    raise exception 'forbidden: admin role required' using errcode = 'P0003';
  end if;
  out_user_id := v_user;
  out_tenant_id := v_profile.tenant_id;
  out_actor := 'human:' || v_profile.provider || ':' || v_profile.identifier;
  return next;
end
$$;
revoke execute on function public._require_admin() from public, anon, authenticated;

-- Admin invites someone by (provider, identifier, role).
create function public.create_invitation(
  p_provider text,
  p_identifier text,
  p_role public.tenant_role default 'member'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller record;
  v_inv_id uuid;
  v_v bigint;
  v_id text;
begin
  if p_provider not in ('github','google','email') then
    raise exception 'invalid_input: provider must be github|google|email' using errcode = 'P0006';
  end if;
  if p_identifier is null or length(trim(p_identifier)) = 0 then
    raise exception 'invalid_input: identifier required' using errcode = 'P0006';
  end if;
  select * into v_caller from public._require_admin();
  v_id := lower(trim(p_identifier));
  insert into public.tenant_invitations (tenant_id, provider, identifier, role, invited_by)
    values (v_caller.out_tenant_id, p_provider, v_id, p_role, v_caller.out_user_id)
    on conflict (tenant_id, provider, identifier) do update
      set role = excluded.role, invited_by = excluded.invited_by
    returning id into v_inv_id;
  select coalesce(max(v), 0) + 1 into v_v from public.operations_log
    where tenant_id = v_caller.out_tenant_id;
  insert into public.operations_log (tenant_id, v, actor, action, target, payload)
    values (
      v_caller.out_tenant_id, v_v, v_caller.out_actor, 'invite',
      p_provider || ':' || v_id,
      jsonb_build_object('provider', p_provider, 'identifier', v_id, 'role', p_role::text)
    );
  return v_inv_id;
end
$$;

create function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller record;
  v_inv public.tenant_invitations%rowtype;
  v_v bigint;
begin
  select * into v_caller from public._require_admin();
  select * into v_inv from public.tenant_invitations
    where id = p_invitation_id and tenant_id = v_caller.out_tenant_id;
  if v_inv.id is null then
    raise exception 'not_found: invitation does not exist' using errcode = 'P0004';
  end if;
  delete from public.tenant_invitations where id = p_invitation_id;
  select coalesce(max(v), 0) + 1 into v_v from public.operations_log
    where tenant_id = v_caller.out_tenant_id;
  insert into public.operations_log (tenant_id, v, actor, action, target, payload)
    values (
      v_caller.out_tenant_id, v_v, v_caller.out_actor, 'revoke_invitation',
      v_inv.provider || ':' || v_inv.identifier,
      jsonb_build_object('provider', v_inv.provider, 'identifier', v_inv.identifier, 'role', v_inv.role::text)
    );
end
$$;

-- Last-admin protection: cannot demote the only remaining admin.
create function public.change_member_role(p_user_id uuid, p_new_role public.tenant_role)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller record;
  v_target public.tenant_members%rowtype;
  v_admin_count int;
  v_target_email text;
  v_v bigint;
begin
  select * into v_caller from public._require_admin();
  select * into v_target from public.tenant_members
    where user_id = p_user_id and tenant_id = v_caller.out_tenant_id;
  if v_target.user_id is null then
    raise exception 'not_found: user is not a member of this tenant' using errcode = 'P0004';
  end if;
  if v_target.role = p_new_role then return; end if;
  if v_target.role = 'admin' and p_new_role <> 'admin' then
    select count(*) into v_admin_count from public.tenant_members
      where tenant_id = v_caller.out_tenant_id and role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'invalid_state: cannot demote the last admin' using errcode = 'P0005';
    end if;
  end if;
  update public.tenant_members
    set role = p_new_role
    where user_id = p_user_id and tenant_id = v_caller.out_tenant_id;
  select email into v_target_email from auth.users where id = p_user_id;
  select coalesce(max(v), 0) + 1 into v_v from public.operations_log
    where tenant_id = v_caller.out_tenant_id;
  insert into public.operations_log (tenant_id, v, actor, action, target, payload)
    values (
      v_caller.out_tenant_id, v_v, v_caller.out_actor, 'change_role',
      coalesce(v_target_email, p_user_id::text),
      jsonb_build_object('user_id', p_user_id, 'old_role', v_target.role::text, 'new_role', p_new_role::text)
    );
end
$$;

-- Admin removes a member. Forbids self-remove (use change_role first) and
-- last-admin removal.
create function public.remove_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller record;
  v_target public.tenant_members%rowtype;
  v_admin_count int;
  v_target_email text;
  v_v bigint;
begin
  select * into v_caller from public._require_admin();
  if p_user_id = v_caller.out_user_id then
    raise exception 'invalid_input: use change_member_role to step down before removing yourself'
      using errcode = 'P0006';
  end if;
  select * into v_target from public.tenant_members
    where user_id = p_user_id and tenant_id = v_caller.out_tenant_id;
  if v_target.user_id is null then
    raise exception 'not_found: user is not a member of this tenant' using errcode = 'P0004';
  end if;
  if v_target.role = 'admin' then
    select count(*) into v_admin_count from public.tenant_members
      where tenant_id = v_caller.out_tenant_id and role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'invalid_state: cannot remove the last admin' using errcode = 'P0005';
    end if;
  end if;
  delete from public.tenant_members
    where user_id = p_user_id and tenant_id = v_caller.out_tenant_id;
  select email into v_target_email from auth.users where id = p_user_id;
  select coalesce(max(v), 0) + 1 into v_v from public.operations_log
    where tenant_id = v_caller.out_tenant_id;
  insert into public.operations_log (tenant_id, v, actor, action, target, payload)
    values (
      v_caller.out_tenant_id, v_v, v_caller.out_actor, 'remove_member',
      coalesce(v_target_email, p_user_id::text),
      jsonb_build_object('user_id', p_user_id, 'old_role', v_target.role::text)
    );
end
$$;

revoke execute on function public.create_invitation(text, text, public.tenant_role) from public, anon;
revoke execute on function public.revoke_invitation(uuid) from public, anon;
revoke execute on function public.change_member_role(uuid, public.tenant_role) from public, anon;
revoke execute on function public.remove_member(uuid) from public, anon;
grant execute on function public.create_invitation(text, text, public.tenant_role) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.change_member_role(uuid, public.tenant_role) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
