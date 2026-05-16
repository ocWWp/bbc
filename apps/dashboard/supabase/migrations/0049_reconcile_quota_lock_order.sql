-- M4.6 codex follow-up — fix reconcile_quota lock order.
--
-- 0048's reconcile_quota acquired locks in the inverse order from
-- reserve_quota (reservation row first, then tenant_quotas row). Under
-- concurrent traffic that's a classic A→B vs B→A deadlock:
--   T1 reserve_quota: locks tenant_quotas, then UPDATEs orphan reservations
--     (taking row locks on them).
--   T2 reconcile_quota: locks the same reservation row, then tries to
--     lock tenant_quotas — waits on T1; T1 waits on T2 if the orphan
--     UPDATE happens to hit T2's reservation row.
-- Postgres detects and aborts one transaction at random; reconcile_quota
-- (or reserve_quota) intermittently fails.
--
-- Fix: reconcile_quota now resolves tenant_id with a non-locking SELECT,
-- then acquires the tenant_quotas row lock FIRST, then re-reads the
-- reservation under lock. Identical lock order to reserve_quota.

create or replace function public.reconcile_quota(
  p_reservation_id uuid,
  p_actual_tokens  int
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_r       public.tenant_quota_reservations%rowtype;
  v_tenant  uuid;
  v_delta   int;
begin
  if p_actual_tokens < 0 then
    raise exception 'invalid_input: actual_tokens must be >= 0' using errcode = 'P0006';
  end if;

  -- Resolve tenant_id without locking. We need it to acquire the
  -- tenant_quotas lock first — same order as reserve_quota.
  select tenant_id into v_tenant
    from public.tenant_quota_reservations
   where id = p_reservation_id;
  if v_tenant is null then
    raise exception 'not_found: reservation % not found', p_reservation_id
      using errcode = 'P0004';
  end if;

  perform 1 from public.tenant_quotas
    where tenant_id = v_tenant
    for update;

  -- Re-read the reservation under lock now that ordering is safe.
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
