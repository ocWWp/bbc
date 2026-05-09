-- Phase 3 migration 0008: write-path SQL functions
-- accept_proposal + reject_proposal: atomic, role-gated, audit-trailed.
-- These are the DB-mode equivalent of bash scripts/{accept,reject}.sh.
-- Invoked via supabase.rpc() from the dashboard's authenticated server client.

create or replace function public.accept_proposal(p_proposal_id text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user      uuid;
  v_profile   public.profiles%rowtype;
  v_tenant    uuid;
  v_actor     text;
  v_role      public.tenant_role;
  v_qi        public.queue_items%rowtype;
  v_v         bigint;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'unauthorized: sign in required' using errcode = 'P0002';
  end if;

  select * into v_profile from public.profiles where user_id = v_user;
  if v_profile.user_id is null then
    raise exception 'unauthorized: missing profile' using errcode = 'P0002';
  end if;
  v_tenant := v_profile.tenant_id;
  v_actor  := 'human:' || v_profile.provider || ':' || v_profile.identifier;

  select role into v_role from public.tenant_members
    where user_id = v_user and tenant_id = v_tenant;
  if v_role is null or v_role = 'viewer' then
    raise exception 'forbidden: accept requires member or admin role'
      using errcode = 'P0003';
  end if;

  select * into v_qi from public.queue_items
    where tenant_id = v_tenant and proposal_id = p_proposal_id;
  if v_qi.id is null then
    raise exception 'not_found: proposal % does not exist', p_proposal_id
      using errcode = 'P0004';
  end if;
  if v_qi.status <> 'pending' then
    raise exception 'invalid_state: proposal is already %', v_qi.status
      using errcode = 'P0005';
  end if;

  update public.queue_items
     set status = 'accepted', resolved_at = now()
   where tenant_id = v_tenant and proposal_id = p_proposal_id;

  insert into public.proposals_accepted (
    tenant_id, proposal_id, accepted_by, body, frontmatter
  ) values (
    v_tenant, p_proposal_id, v_user, v_qi.body, v_qi.frontmatter
  );

  select coalesce(max(v), 0) + 1 into v_v
    from public.operations_log where tenant_id = v_tenant;
  insert into public.operations_log (
    tenant_id, v, actor, action, target, payload
  ) values (
    v_tenant, v_v, v_actor, 'accept', p_proposal_id,
    jsonb_build_object('proposal_id', p_proposal_id)
  );
end
$$;

create or replace function public.reject_proposal(p_proposal_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user      uuid;
  v_profile   public.profiles%rowtype;
  v_tenant    uuid;
  v_actor     text;
  v_role      public.tenant_role;
  v_qi        public.queue_items%rowtype;
  v_v         bigint;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'invalid_input: reason required' using errcode = 'P0006';
  end if;
  if length(p_reason) > 500 then
    raise exception 'invalid_input: reason exceeds 500 chars' using errcode = 'P0006';
  end if;

  v_user := auth.uid();
  if v_user is null then
    raise exception 'unauthorized: sign in required' using errcode = 'P0002';
  end if;

  select * into v_profile from public.profiles where user_id = v_user;
  if v_profile.user_id is null then
    raise exception 'unauthorized: missing profile' using errcode = 'P0002';
  end if;
  v_tenant := v_profile.tenant_id;
  v_actor  := 'human:' || v_profile.provider || ':' || v_profile.identifier;

  select role into v_role from public.tenant_members
    where user_id = v_user and tenant_id = v_tenant;
  if v_role is null or v_role = 'viewer' then
    raise exception 'forbidden: reject requires member or admin role'
      using errcode = 'P0003';
  end if;

  select * into v_qi from public.queue_items
    where tenant_id = v_tenant and proposal_id = p_proposal_id;
  if v_qi.id is null then
    raise exception 'not_found: proposal % does not exist', p_proposal_id
      using errcode = 'P0004';
  end if;
  if v_qi.status <> 'pending' then
    raise exception 'invalid_state: proposal is already %', v_qi.status
      using errcode = 'P0005';
  end if;

  update public.queue_items
     set status = 'rejected', resolved_at = now(), reject_reason = p_reason
   where tenant_id = v_tenant and proposal_id = p_proposal_id;

  insert into public.proposals_rejected (
    tenant_id, proposal_id, rejected_by, reason, body, frontmatter
  ) values (
    v_tenant, p_proposal_id, v_user, p_reason, v_qi.body, v_qi.frontmatter
  );

  select coalesce(max(v), 0) + 1 into v_v
    from public.operations_log where tenant_id = v_tenant;
  insert into public.operations_log (
    tenant_id, v, actor, action, target, payload
  ) values (
    v_tenant, v_v, v_actor, 'reject', p_proposal_id,
    jsonb_build_object('proposal_id', p_proposal_id, 'reason', p_reason)
  );
end
$$;

revoke execute on function public.accept_proposal(text) from public, anon;
revoke execute on function public.reject_proposal(text, text) from public, anon;
grant execute on function public.accept_proposal(text) to authenticated;
grant execute on function public.reject_proposal(text, text) to authenticated;
