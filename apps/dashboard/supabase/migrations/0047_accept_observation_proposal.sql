-- v1.6 M3.4 — accept_proposal_observation() RPC.
--
-- Atomically promotes a queue_items observation proposal into a
-- memory_files row. Until this RPC runs, NO memory_files row exists for
-- an observation finding — staged content lives only in the queue item
-- body + observer_runs.staged_finding. This keeps half-baked findings
-- out of citation surfaces and memory search (per design doc + ADR-0008).
--
-- Two preconditions vs the standard accept_proposal():
-- 1. The frontmatter must have type='observation' (otherwise the caller
--    routed to the wrong RPC — fall back to accept_proposal()).
-- 2. The frontmatter observer_run_id must match a real observer_runs
--    row in the same tenant (cross-check, since the queue item body and
--    the run record were written by the same transaction in
--    propose_observation()).
--
-- memory_files.type needs an 'observation' enum value; alter that enum
-- first (per migration policy: 'enum is unconditional, idempotent').

alter type public.memory_type add value if not exists 'observation';

-- ────────────────────────────────────────────────────────────────────
-- accept_proposal_observation(p_proposal_id text) RETURNS jsonb
-- ────────────────────────────────────────────────────────────────────

create or replace function public.accept_proposal_observation(
  p_proposal_id text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user        uuid := auth.uid();
  v_profile     public.profiles%rowtype;
  v_actor       text;
  v_queue       public.queue_items%rowtype;
  v_run         public.observer_runs%rowtype;
  v_run_id_txt  text;
  v_run_id      uuid;
  v_staged      jsonb;
  v_target_path text;
  v_slug        text;
  v_memory_id   uuid;
  v_next_v      bigint;
begin
  if v_user is null then
    raise exception 'unauthorized: sign in required' using errcode = 'P0002';
  end if;

  -- Locate the queue row by proposal_id (text slug).
  select * into v_queue from public.queue_items where proposal_id = p_proposal_id;
  if v_queue.id is null then
    raise exception 'not_found: proposal % not in queue', p_proposal_id
      using errcode = 'P0004';
  end if;
  if v_queue.status <> 'pending' then
    raise exception 'invalid_state: proposal % is not pending (status=%)',
      p_proposal_id, v_queue.status using errcode = 'P0005';
  end if;
  if not public.is_operator_of(v_queue.tenant_id) then
    raise exception 'forbidden: operator+ required' using errcode = 'P0003';
  end if;

  if coalesce(v_queue.frontmatter ->> 'type', '') <> 'observation' then
    raise exception 'invalid_input: proposal % is not type=observation (use accept_proposal instead)',
      p_proposal_id using errcode = 'P0006';
  end if;

  v_run_id_txt := v_queue.frontmatter ->> 'observer_run_id';
  if v_run_id_txt is null then
    raise exception 'invalid_input: proposal % missing observer_run_id in frontmatter',
      p_proposal_id using errcode = 'P0006';
  end if;
  begin
    v_run_id := v_run_id_txt::uuid;
  exception when others then
    raise exception 'invalid_input: observer_run_id is not a uuid: %', v_run_id_txt
      using errcode = 'P0006';
  end;

  select * into v_run from public.observer_runs
    where id = v_run_id and tenant_id = v_queue.tenant_id;
  if v_run.id is null then
    raise exception 'not_found: observer_run % not found for tenant', v_run_id
      using errcode = 'P0004';
  end if;
  v_staged := v_run.staged_finding;
  if v_staged is null then
    raise exception 'invalid_state: observer_run % has no staged_finding', v_run_id
      using errcode = 'P0005';
  end if;

  -- Resolve actor string for operations_log.
  select * into v_profile from public.profiles where user_id = v_user;
  if v_profile.user_id is null then
    v_actor := 'user:' || v_user::text;
  else
    v_actor := 'human:' || v_profile.provider || ':' || v_profile.identifier;
  end if;

  -- Target path comes from the frontmatter (deterministic — written by
  -- propose_observation as memory/observations/<run_id>.md).
  v_target_path := coalesce(
    v_queue.frontmatter ->> 'target_file',
    'memory/observations/' || v_run_id::text || '.md'
  );

  -- Build the memory_files row from staged_finding. Body text becomes the
  -- queue item body (already written by propose_observation); we mirror
  -- it onto memory_files.content.
  v_slug := lower(coalesce(v_staged ->> 'slug',
                           v_staged -> 'anomalySummary' ->> 'metric',
                           'observation-' || v_run_id::text));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
  v_slug := substring(v_slug from 1 for 60);

  insert into public.memory_files (
    tenant_id, path, type, status, slug, title,
    content, frontmatter, fields, body_blocks
  ) values (
    v_queue.tenant_id,
    v_target_path,
    'observation'::public.memory_type,
    'active'::public.memory_status,
    v_slug,
    coalesce(v_staged ->> 'title', v_queue.frontmatter ->> 'diff_summary'),
    v_queue.body,
    -- Mirror the queue frontmatter so memory readers don't have to JOIN
    -- back through queue_items for the anomaly context.
    v_queue.frontmatter,
    coalesce(v_staged -> 'fields', '{}'::jsonb),
    coalesce(v_staged -> 'body_blocks', '[]'::jsonb)
  ) returning id into v_memory_id;

  -- Mark queue item accepted.
  update public.queue_items
     set status = 'accepted'::public.queue_status,
         resolved_at = now()
   where id = v_queue.id;

  insert into public.proposals_accepted (
    tenant_id, proposal_id, accepted_by, accepted_at, body, frontmatter
  ) values (
    v_queue.tenant_id, p_proposal_id, v_user, now(), v_queue.body, v_queue.frontmatter
  )
  on conflict (tenant_id, proposal_id) do nothing;

  -- operations_log append.
  select coalesce(max(v), 0) + 1 into v_next_v
    from public.operations_log where tenant_id = v_queue.tenant_id;
  insert into public.operations_log (tenant_id, v, actor, action, target, payload)
  values (
    v_queue.tenant_id,
    v_next_v,
    v_actor,
    'accept_observation',
    p_proposal_id,
    jsonb_build_object(
      'proposal_id',     p_proposal_id,
      'observer_run_id', v_run_id,
      'memory_file_id',  v_memory_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'proposalId',   p_proposal_id,
    'memoryFileId', v_memory_id,
    'observerRunId', v_run_id
  );
end $$;

revoke execute on function public.accept_proposal_observation(text) from public, anon;
grant execute on function public.accept_proposal_observation(text) to authenticated;
