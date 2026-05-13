-- v1.5 launch polish: RBAC — re-gate accept_proposal / reject_proposal.
--
-- Per ADR-0012. The original definitions in 0008_write_path_functions.sql
-- allowed any non-viewer role to accept/reject. After ADR-0012 the new
-- 'member' role is read-only-plus-propose — only operators and admins
-- may accept or reject queue items.
--
-- These re-issues preserve every other behavior of the originals (audit
-- trail in operations_log, archive into proposals_accepted /
-- proposals_rejected, status transitions). The only change is the role
-- check: 'forbidden' if the caller is not is_operator_of(tenant).

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

  if not public.is_operator_of(v_tenant) then
    raise exception 'forbidden: accept requires operator or admin role'
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

  if not public.is_operator_of(v_tenant) then
    raise exception 'forbidden: reject requires operator or admin role'
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

-- Grants are inherited from 0008 (revoke from public/anon, grant to authenticated).
-- No need to re-issue; CREATE OR REPLACE preserves the existing grants.
