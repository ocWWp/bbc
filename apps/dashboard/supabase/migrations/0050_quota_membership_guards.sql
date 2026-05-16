-- M5.2 codex follow-up — tenant-membership guards on quota RPCs.
--
-- 0048 and 0049 ship reserve_quota / reconcile_quota as SECURITY DEFINER
-- (they bypass RLS by design — direct writes to tenant_quotas /
-- tenant_quota_reservations are revoked from authenticated). But neither
-- function verified the caller actually belongs to the tenant they were
-- acting on. Any signed-in user could:
--   - reserve_quota against an arbitrary p_tenant_id and burn the
--     victim's daily token budget
--   - reconcile_quota against a guessed reservation UUID and skew the
--     victim's tokens_used counter
--
-- Fix: both functions now require auth.uid() + is_member_of(tenant)
-- before any read or write. Same gate the propose_change RPC uses
-- (migration 0040), so behavior is consistent with the rest of the
-- DB-mode write path.

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
  c_max_tokens     constant int := 1000000;
  c_max_turns      constant int := 1000;
  c_max_runs       constant int := 240;
  c_max_signals    constant int := 10;
  c_orphan_window  constant interval := interval '5 minutes';

  v_user           uuid := auth.uid();
  v_q              public.tenant_quotas%rowtype;
  v_signals_live   int;
  v_reservation_id uuid;
  v_today          date := current_date;
  v_recovered      int;
begin
  if v_user is null then
    raise exception 'unauthorized: sign in required' using errcode = 'P0002';
  end if;
  if not public.is_member_of(p_tenant_id) then
    raise exception 'forbidden: not a member of tenant' using errcode = 'P0003';
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

  update public.tenant_quota_reservations
     set reconciled_at = now(),
         actual_tokens = estimated_tokens
   where tenant_id     = p_tenant_id
     and reconciled_at is null
     and reserved_at   < now() - c_orphan_window;
  get diagnostics v_recovered = row_count;

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

  if v_q.tokens_used + p_estimated_tokens > c_max_tokens then
    return jsonb_build_object('ok', false, 'reason', 'tokens_exceeded');
  end if;

  if p_kind = 'home_turn' and v_q.turns_count + 1 > c_max_turns then
    return jsonb_build_object('ok', false, 'reason', 'turns_exceeded');
  end if;

  if p_kind = 'observer_run' then
    if v_q.runs_today + 1 > c_max_runs then
      return jsonb_build_object('ok', false, 'reason', 'runs_exceeded');
    end if;
    if v_signals_live > c_max_signals then
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

create or replace function public.reconcile_quota(
  p_reservation_id uuid,
  p_actual_tokens  int
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user    uuid := auth.uid();
  v_r       public.tenant_quota_reservations%rowtype;
  v_tenant  uuid;
  v_delta   int;
begin
  if v_user is null then
    raise exception 'unauthorized: sign in required' using errcode = 'P0002';
  end if;
  if p_actual_tokens < 0 then
    raise exception 'invalid_input: actual_tokens must be >= 0' using errcode = 'P0006';
  end if;

  -- Resolve tenant_id without locking so we can acquire locks in the
  -- same order as reserve_quota and guard membership before any lock.
  select tenant_id into v_tenant
    from public.tenant_quota_reservations
   where id = p_reservation_id;
  if v_tenant is null then
    raise exception 'not_found: reservation % not found', p_reservation_id
      using errcode = 'P0004';
  end if;

  if not public.is_member_of(v_tenant) then
    -- Don't leak whether the UUID exists in another tenant.
    raise exception 'not_found: reservation % not found', p_reservation_id
      using errcode = 'P0004';
  end if;

  perform 1 from public.tenant_quotas
    where tenant_id = v_tenant
    for update;

  select * into v_r
    from public.tenant_quota_reservations
   where id = p_reservation_id
   for update;

  if v_r.id is null then
    raise exception 'not_found: reservation % not found', p_reservation_id
      using errcode = 'P0004';
  end if;

  if v_r.reconciled_at is not null then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  v_delta := p_actual_tokens - v_r.estimated_tokens;

  update public.tenant_quotas
     set tokens_used = greatest(0, tokens_used + v_delta),
         updated_at  = now()
   where tenant_id   = v_tenant;

  update public.tenant_quota_reservations
     set reconciled_at = now(),
         actual_tokens = p_actual_tokens
   where id = p_reservation_id;

  return jsonb_build_object('ok', true);
end $$;
