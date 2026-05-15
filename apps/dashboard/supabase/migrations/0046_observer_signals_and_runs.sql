-- v1.6 M3.1 — observer Loop 3 backbone.
--
-- Adds the two tables (observer_signals catalog + observer_runs append-only
-- audit) and the SECURITY DEFINER `propose_observation()` RPC that the
-- M1 ProposalEmitter wraps. The RPC writes both the queue_items row (for
-- the proposal lifecycle) and the observer_runs row (for the audit trace)
-- in one transaction with a shared pre-generated observer_run_id.
--
-- Why a dedicated RPC instead of extending propose_change():
--   - propose_change() is part of the queue contract and is mirrored by
--     file-mode scripts/propose.sh. Extending it would force a shape
--     change on both modes.
--   - observation proposals carry frontmatter fields (observer_run_id,
--     signal_source, anomaly_summary) that don't fit the canonical
--     edit/add/supersede/archive/flag shape.
--   - The same transaction must also write observer_runs — one RPC is
--     the only way to do that atomically with a shared id.
--
-- Codex M0 review fixes folded in:
--   P1 #1 — RLS uses public.is_member_of(tenant_id), not GUC settings.
--   P1 #2 — append-only via unconditional UPDATE-block trigger (no
--           pg_trigger_depth() check, which was incorrect under SECURITY
--           DEFINER).
--   P1 #6 — pre-generate observer_run_id at top of transaction so the
--           queue frontmatter can carry it.
--   P2 #8 — argument validation pinned by status.
--   P2 #14 — RLS USING and WITH CHECK both supplied explicitly.

-- ────────────────────────────────────────────────────────────────────
-- observer_signals — per-tenant catalog of watches
-- ────────────────────────────────────────────────────────────────────

create table public.observer_signals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  signal_type   text not null,
  config_jsonb  jsonb not null default '{}'::jsonb,
  enabled       boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  disabled_at   timestamptz,
  deleted_at    timestamptz
);

create index observer_signals_tenant_enabled_idx
  on public.observer_signals(tenant_id, enabled, deleted_at);

alter table public.observer_signals enable row level security;

create policy observer_signals_member_read on public.observer_signals
  for select using (public.is_member_of(tenant_id));

create policy observer_signals_operator_write on public.observer_signals
  for all using (
    public.is_member_of(tenant_id) and public.is_operator_of(tenant_id)
  ) with check (
    public.is_member_of(tenant_id) and public.is_operator_of(tenant_id)
  );

-- ────────────────────────────────────────────────────────────────────
-- observer_runs — append-only audit of every run (one row per run)
-- ────────────────────────────────────────────────────────────────────

create table public.observer_runs (
  id                  uuid primary key default gen_random_uuid(),
  signal_id           uuid not null references public.observer_signals(id) on delete cascade,
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  ran_at              timestamptz not null default now(),
  requested_by        uuid references auth.users(id) on delete set null,
  executed_by         text not null default 'user'
                        check (executed_by in ('user', 'cron')),
  window_start        timestamptz not null,
  window_end          timestamptz not null,
  window_snapshot     jsonb not null default '{}'::jsonb,
  anomalies_jsonb     jsonb not null default '[]'::jsonb,
  staged_finding      jsonb,
  proposals_filed     text[] not null default array[]::text[],
  llm_call_id         text,
  llm_tokens_used     integer,
  status              text not null
                        check (status in ('completed',
                                          'no_anomaly',
                                          'skipped_cooldown',
                                          'skipped_min_sample',
                                          'quota_exhausted',
                                          'adapter_error',
                                          'llm_error')),
  error_class         text,
  unique (signal_id, window_start)
);

create index observer_runs_signal_idx on public.observer_runs(signal_id, ran_at desc);
create index observer_runs_tenant_idx on public.observer_runs(tenant_id, ran_at desc);

alter table public.observer_runs enable row level security;

create policy observer_runs_member_read on public.observer_runs
  for select using (public.is_member_of(tenant_id));

-- Direct writes blocked. The only insert path is propose_observation()
-- (SECURITY DEFINER). The unique (signal_id, window_start) is the
-- idempotency key — re-running on the same window cannot duplicate-emit.
revoke insert, update, delete on public.observer_runs from authenticated;

-- Unconditional UPDATE block. No legitimate path UPDATEs observer_runs;
-- the row is inserted with terminal status and never changed. DELETE
-- intentionally not blocked at the trigger layer so ON DELETE CASCADE
-- works for tenant teardown + service-role retention purges (per
-- migration policy §4).
create or replace function public.block_observer_run_update()
  returns trigger language plpgsql security definer
  set search_path = public as $$
begin
  raise exception 'observer_runs is append-only — single-INSERT design, updates forbidden'
    using errcode = 'P0001';
end $$;
revoke execute on function public.block_observer_run_update() from public, anon, authenticated;

create trigger observer_runs_no_update
  before update on public.observer_runs
  for each row execute function public.block_observer_run_update();

-- ────────────────────────────────────────────────────────────────────
-- propose_observation() — atomic queue+run insert via shared run_id
-- ────────────────────────────────────────────────────────────────────

create or replace function public.propose_observation(
  p_tenant_id        uuid,
  p_signal_id        uuid,
  p_window_start     timestamptz,
  p_window_end       timestamptz,
  p_window_snapshot  jsonb,
  p_anomalies        jsonb,
  p_staged_finding   jsonb,
  p_llm_call_id      text,
  p_llm_tokens_used  integer,
  p_status           text,
  p_error_class      text,
  p_proposal_body    text,
  p_proposal_summary text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user        uuid := auth.uid();
  v_signal      public.observer_signals%rowtype;
  v_profile     public.profiles%rowtype;
  v_actor       text;
  v_run_id      uuid := gen_random_uuid();
  v_proposal_id text;
  v_slug        text;
  v_frontmatter jsonb;
begin
  if v_user is null then
    raise exception 'unauthorized: sign in required' using errcode = 'P0002';
  end if;
  if not public.is_operator_of(p_tenant_id) then
    raise exception 'forbidden: operator+ required' using errcode = 'P0003';
  end if;

  -- Signal must belong to the tenant, be enabled, and not soft-deleted.
  select * into v_signal from public.observer_signals
    where id = p_signal_id and tenant_id = p_tenant_id and deleted_at is null;
  if v_signal.id is null then
    raise exception 'not_found: signal % not found in tenant', p_signal_id
      using errcode = 'P0004';
  end if;
  if v_signal.enabled is not true then
    raise exception 'invalid_input: signal % is not enabled', p_signal_id
      using errcode = 'P0006';
  end if;

  -- Status-conditional argument validation (policy P2 #8).
  if p_status = 'completed' then
    if p_staged_finding is null or p_proposal_body is null or p_proposal_summary is null then
      raise exception 'invalid_input: completed requires staged_finding + proposal_body + proposal_summary'
        using errcode = 'P0006';
    end if;
  elsif p_status in ('no_anomaly','skipped_cooldown','skipped_min_sample',
                     'quota_exhausted','adapter_error','llm_error') then
    if p_staged_finding is not null or p_proposal_body is not null or p_proposal_summary is not null then
      raise exception 'invalid_input: non-completed statuses must have null staged_finding/proposal'
        using errcode = 'P0006';
    end if;
  else
    raise exception 'invalid_input: unknown status %', p_status
      using errcode = 'P0006';
  end if;

  -- Resolve the actor string the same way propose_change() does.
  select * into v_profile from public.profiles where user_id = v_user;
  if v_profile.user_id is null then
    v_actor := 'user:' || v_user::text;
  else
    v_actor := 'human:' || v_profile.provider || ':' || v_profile.identifier;
  end if;

  -- Completed runs file a queue item; other terminal statuses only log the run.
  if p_status = 'completed' then
    v_slug := lower(coalesce(p_proposal_summary, ''));
    v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
    v_slug := substring(v_slug from 1 for 40);
    if v_slug is null or length(v_slug) = 0 then
      v_slug := 'observation';
    end if;

    v_proposal_id := format(
      'prop_%s_observer_%s',
      to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24-MI-SS"Z"'),
      v_slug
    );

    v_frontmatter := jsonb_build_object(
      'proposal_id',     v_proposal_id,
      'proposed_by',     v_actor,
      'proposed_at',     to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'target_layer',    'main',
      'target_file',     'memory/observations/' || v_run_id::text || '.md',
      'change_kind',     'add',
      'diff_summary',    p_proposal_summary,
      'source',          'observer',
      -- Observer-specific frontmatter so the queue detail page can render
      -- "How BBC found this" without a JOIN back to observer_runs.
      'type',            'observation',
      'observer_run_id', v_run_id,
      'signal_source',   v_signal.signal_type,
      'signal_id',       v_signal.id,
      'anomaly_summary', coalesce(p_staged_finding -> 'anomalySummary', '{}'::jsonb),
      'baseline_window', coalesce(p_staged_finding -> 'baselineWindow', '{}'::jsonb),
      'citations',       coalesce(p_staged_finding -> 'citations', '[]'::jsonb)
    );

    -- queue_items columns: tenant_id, proposal_id, status, body, frontmatter.
    -- Everything else (change_kind, target_file, diff_summary, proposed_by, ...)
    -- lives inside the frontmatter jsonb so file-mode + DB-mode are identical.
    insert into public.queue_items (tenant_id, proposal_id, status, body, frontmatter)
    values (
      p_tenant_id,
      v_proposal_id,
      'pending'::public.queue_status,
      p_proposal_body,
      v_frontmatter
    );
  end if;

  insert into public.observer_runs (
    id, signal_id, tenant_id, requested_by, executed_by,
    window_start, window_end, window_snapshot, anomalies_jsonb,
    staged_finding, proposals_filed,
    llm_call_id, llm_tokens_used, status, error_class
  ) values (
    v_run_id, p_signal_id, p_tenant_id, v_user, 'user',
    p_window_start, p_window_end, p_window_snapshot, coalesce(p_anomalies, '[]'::jsonb),
    p_staged_finding,
    case when v_proposal_id is not null then array[v_proposal_id] else array[]::text[] end,
    p_llm_call_id, p_llm_tokens_used, p_status, p_error_class
  );

  declare
    v_next_v bigint;
  begin
    select coalesce(max(v), 0) + 1 into v_next_v
      from public.operations_log where tenant_id = p_tenant_id;
    insert into public.operations_log (tenant_id, v, actor, action, target, payload)
    values (
      p_tenant_id,
      v_next_v,
      v_actor,
      'observer_run',
      v_run_id::text,
      jsonb_build_object(
        'observer_run_id', v_run_id,
        'signal_id',       p_signal_id,
        'status',          p_status,
        'proposal_id',     v_proposal_id
      )
    );
  end;

  return jsonb_build_object(
    'ok', true,
    'observerRunId', v_run_id,
    'proposalId',    v_proposal_id
  );
exception
  when unique_violation then
    -- Idempotency: same (signal_id, window_start) re-run cannot duplicate-emit.
    return jsonb_build_object(
      'ok', false,
      'error', 'duplicate_window: observer_run already exists for this signal+window'
    );
end $$;

revoke execute on function public.propose_observation(
  uuid, uuid, timestamptz, timestamptz, jsonb, jsonb, jsonb,
  text, integer, text, text, text, text
) from public, anon;
grant execute on function public.propose_observation(
  uuid, uuid, timestamptz, timestamptz, jsonb, jsonb, jsonb,
  text, integer, text, text, text, text
) to authenticated;
