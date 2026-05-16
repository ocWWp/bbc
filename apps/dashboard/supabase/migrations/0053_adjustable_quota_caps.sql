-- v1.7 PR-C — adjustable per-tenant quota caps.
--
-- Migration 0048 hardcoded the caps as constants inside reserve_quota().
-- /home tells users "raise the limit in settings" but the page didn't
-- exist and the caps weren't adjustable. This migration:
--
-- 1. Adds four nullable override columns to tenant_quotas. NULL = use
--    the built-in default. Non-null = use this value instead.
-- 2. Recreates reserve_quota() to coalesce override → default when
--    deciding which cap to gate on.
-- 3. Adds set_quota_caps() — admin-only SECURITY DEFINER RPC that
--    writes the overrides, locking the tenant_quotas row to serialize
--    against concurrent reserve_quota writers, and appends a
--    'quota_caps_updated' entry to operations_log for audit.
--
-- Caps are bounded server-side (UPPER_BOUND below) so a typo can't
-- request 1e10 tokens. Null is always permitted (= revert to default).

-- ────────────────────────────────────────────────────────────────────
-- 1. Override columns. Each must be positive when set; null means
--    "fall back to the default constant in reserve_quota()".
-- ────────────────────────────────────────────────────────────────────

alter table public.tenant_quotas
  add column if not exists max_tokens_override   int,
  add column if not exists max_turns_override    int,
  add column if not exists max_runs_override     int,
  add column if not exists max_signals_override  int;

-- Range checks (use named constraints so re-running the migration is safe).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenant_quotas_max_tokens_override_chk'
  ) then
    alter table public.tenant_quotas
      add constraint tenant_quotas_max_tokens_override_chk
      check (max_tokens_override is null or (max_tokens_override > 0 and max_tokens_override <= 100000000));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'tenant_quotas_max_turns_override_chk'
  ) then
    alter table public.tenant_quotas
      add constraint tenant_quotas_max_turns_override_chk
      check (max_turns_override is null or (max_turns_override > 0 and max_turns_override <= 100000));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'tenant_quotas_max_runs_override_chk'
  ) then
    alter table public.tenant_quotas
      add constraint tenant_quotas_max_runs_override_chk
      check (max_runs_override is null or (max_runs_override > 0 and max_runs_override <= 24000));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'tenant_quotas_max_signals_override_chk'
  ) then
    alter table public.tenant_quotas
      add constraint tenant_quotas_max_signals_override_chk
      check (max_signals_override is null or (max_signals_override > 0 and max_signals_override <= 1000));
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────
-- 2. reserve_quota — same shape and concurrency contract as 0048;
--    only the cap-resolution changes: coalesce(override, default).
-- ────────────────────────────────────────────────────────────────────

create or replace function public.reserve_quota(
  p_tenant_id        uuid,
  p_actor_id         uuid,
  p_estimated_tokens int,
  p_kind             text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  c_default_tokens   constant int := 1000000;
  c_default_turns    constant int := 1000;
  c_default_runs     constant int := 240;
  c_default_signals  constant int := 10;
  c_orphan_window    constant interval := interval '5 minutes';

  v_q              public.tenant_quotas%rowtype;
  v_signals_live   int;
  v_reservation_id uuid;
  v_today          date := current_date;
  v_recovered      int;

  v_max_tokens     int;
  v_max_turns      int;
  v_max_runs       int;
  v_max_signals    int;
begin
  if v_today is null then
    raise exception 'unexpected: current_date null';
  end if;

  if p_kind not in ('home_turn', 'observer_run') then
    raise exception 'invalid_input: unknown kind %', p_kind using errcode = 'P0006';
  end if;
  if p_estimated_tokens < 0 then
    raise exception 'invalid_input: estimated_tokens must be >= 0' using errcode = 'P0006';
  end if;

  select * into v_q
    from public.tenant_quotas
   where tenant_id = p_tenant_id
   for update;

  if v_q.tenant_id is null then
    raise exception 'not_found: tenant_quotas row missing for tenant % — bootstrap trigger should have seeded',
      p_tenant_id using errcode = 'P0004';
  end if;

  -- Effective caps: override wins when set.
  v_max_tokens  := coalesce(v_q.max_tokens_override,  c_default_tokens);
  v_max_turns   := coalesce(v_q.max_turns_override,   c_default_turns);
  v_max_runs    := coalesce(v_q.max_runs_override,    c_default_runs);
  v_max_signals := coalesce(v_q.max_signals_override, c_default_signals);

  -- Daily roll.
  if v_q.period_start < v_today then
    update public.tenant_quotas
       set period_start = v_today,
           tokens_used  = 0,
           turns_count  = 0,
           runs_today   = 0,
           updated_at   = now()
     where tenant_id = p_tenant_id;
    v_q.period_start := v_today;
    v_q.tokens_used  := 0;
    v_q.turns_count  := 0;
    v_q.runs_today   := 0;
  end if;

  -- Lazy-clean orphan reservations.
  update public.tenant_quota_reservations
     set reconciled_at = now(),
         actual_tokens = estimated_tokens
   where tenant_id     = p_tenant_id
     and reconciled_at is null
     and reserved_at   < now() - c_orphan_window;
  get diagnostics v_recovered = row_count;

  -- Recompute live signal count.
  select count(*) into v_signals_live
    from public.observer_signals
   where tenant_id = p_tenant_id
     and enabled = true
     and deleted_at is null;

  if v_signals_live <> v_q.signals_active then
    update public.tenant_quotas
       set signals_active = v_signals_live,
           updated_at     = now()
     where tenant_id = p_tenant_id;
    v_q.signals_active := v_signals_live;
  end if;

  -- Budget checks.
  if v_q.tokens_used + p_estimated_tokens > v_max_tokens then
    return jsonb_build_object('ok', false, 'reason', 'tokens_exceeded');
  end if;

  if p_kind = 'home_turn' and v_q.turns_count + 1 > v_max_turns then
    return jsonb_build_object('ok', false, 'reason', 'turns_exceeded');
  end if;

  if p_kind = 'observer_run' then
    if v_q.runs_today + 1 > v_max_runs then
      return jsonb_build_object('ok', false, 'reason', 'runs_exceeded');
    end if;
    if v_signals_live > v_max_signals then
      return jsonb_build_object('ok', false, 'reason', 'signals_exceeded');
    end if;
  end if;

  update public.tenant_quotas
     set tokens_used = tokens_used + p_estimated_tokens,
         turns_count = turns_count + case when p_kind = 'home_turn' then 1 else 0 end,
         runs_today  = runs_today  + case when p_kind = 'observer_run' then 1 else 0 end,
         updated_at  = now()
   where tenant_id = p_tenant_id;

  insert into public.tenant_quota_reservations
    (tenant_id, actor_id, kind, estimated_tokens)
    values (p_tenant_id, p_actor_id, p_kind, p_estimated_tokens)
    returning id into v_reservation_id;

  return jsonb_build_object('ok', true, 'reservation_id', v_reservation_id);
end $$;

revoke execute on function public.reserve_quota(uuid, uuid, int, text)
  from public, anon;
grant execute on function public.reserve_quota(uuid, uuid, int, text)
  to authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 3. set_quota_caps — admin-only RPC that writes the four overrides
--    and audits the change.
--
-- NULL value means "revert this cap to the default". Non-null values
-- are range-checked client-side (page form) and again at the column
-- level. Concurrency: SELECT FOR UPDATE on tenant_quotas serializes
-- against reserve_quota writers.
-- ────────────────────────────────────────────────────────────────────

create or replace function public.set_quota_caps(
  p_max_tokens  int,
  p_max_turns   int,
  p_max_runs    int,
  p_max_signals int
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller record;
  v_old    public.tenant_quotas%rowtype;
  v_v      bigint;
begin
  select * into v_caller from public._require_admin();

  -- Range validation (column checks would raise too, but a clean RPC
  -- error message is friendlier than 23514).
  if p_max_tokens is not null and (p_max_tokens <= 0 or p_max_tokens > 100000000) then
    raise exception 'invalid_input: max_tokens must be in (0, 100_000_000]' using errcode = 'P0006';
  end if;
  if p_max_turns is not null and (p_max_turns <= 0 or p_max_turns > 100000) then
    raise exception 'invalid_input: max_turns must be in (0, 100_000]' using errcode = 'P0006';
  end if;
  if p_max_runs is not null and (p_max_runs <= 0 or p_max_runs > 24000) then
    raise exception 'invalid_input: max_runs must be in (0, 24_000]' using errcode = 'P0006';
  end if;
  if p_max_signals is not null and (p_max_signals <= 0 or p_max_signals > 1000) then
    raise exception 'invalid_input: max_signals must be in (0, 1_000]' using errcode = 'P0006';
  end if;

  -- Read the old row under lock so the audit payload is a true diff
  -- and writers don't drift between read and write.
  select * into v_old
    from public.tenant_quotas
   where tenant_id = v_caller.out_tenant_id
   for update;

  if v_old.tenant_id is null then
    raise exception 'not_found: tenant_quotas row missing for tenant %',
      v_caller.out_tenant_id using errcode = 'P0004';
  end if;

  update public.tenant_quotas
     set max_tokens_override  = p_max_tokens,
         max_turns_override   = p_max_turns,
         max_runs_override    = p_max_runs,
         max_signals_override = p_max_signals,
         updated_at           = now()
   where tenant_id = v_caller.out_tenant_id;

  select coalesce(max(v), 0) + 1 into v_v
    from public.operations_log
   where tenant_id = v_caller.out_tenant_id;

  insert into public.operations_log (tenant_id, v, actor, action, target, payload)
    values (
      v_caller.out_tenant_id,
      v_v,
      v_caller.out_actor,
      'quota_caps_updated',
      'tenant_quotas',
      jsonb_build_object(
        'before', jsonb_build_object(
          'max_tokens',  v_old.max_tokens_override,
          'max_turns',   v_old.max_turns_override,
          'max_runs',    v_old.max_runs_override,
          'max_signals', v_old.max_signals_override
        ),
        'after', jsonb_build_object(
          'max_tokens',  p_max_tokens,
          'max_turns',   p_max_turns,
          'max_runs',    p_max_runs,
          'max_signals', p_max_signals
        )
      )
    );

  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.set_quota_caps(int, int, int, int)
  from public, anon;
grant execute on function public.set_quota_caps(int, int, int, int)
  to authenticated;
