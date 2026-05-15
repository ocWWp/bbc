-- v1.6 M4.1 — tenant_quotas + atomic reserve/reconcile RPCs.
--
-- Per-tenant rolling daily counter + reservations table. The reservation
-- table is the concurrency primitive: reserve_quota() takes SELECT FOR
-- UPDATE on the tenant_quotas row, lazy-cleans stuck reservations under
-- the lock, validates budgets, inserts the reservation row, commits.
-- See docs/plans/2026-05-15-agentic-home-migration-policy.md §5 for the
-- full ordering rationale (codex P2 #9, #11, #18).
--
-- Hard caps are hardcoded constants inside reserve_quota() for v1.6
-- (per design doc). A future /settings/usage page will override them.
--   max_tokens_per_day:     1_000_000
--   max_turns_per_day:      1_000  (tenant-wide; per-user-per-hour deferred to v1.7)
--   max_runs_per_day:       240    (10 signals × 24)
--   max_active_signals:     10

create table public.tenant_quotas (
  tenant_id       uuid primary key references public.tenants(id) on delete cascade,
  period_start    date not null default current_date,
  tokens_used     integer not null default 0,
  turns_count     integer not null default 0,
  runs_today      integer not null default 0,
  signals_active  integer not null default 0,
  updated_at      timestamptz not null default now()
);

create table public.tenant_quota_reservations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  actor_id         uuid references auth.users(id) on delete set null,
  kind             text not null check (kind in ('home_turn', 'observer_run')),
  estimated_tokens integer not null check (estimated_tokens >= 0),
  reserved_at      timestamptz not null default now(),
  reconciled_at    timestamptz,
  actual_tokens    integer
);

create index tenant_quota_reservations_tenant_idx
  on public.tenant_quota_reservations(tenant_id, reconciled_at);

-- ────────────────────────────────────────────────────────────────────
-- Row bootstrap: backfill existing tenants + trigger on new ones.
-- SELECT FOR UPDATE in reserve_quota() requires the row to exist;
-- creating it lazily under contention would race (codex P2 #11).
-- ────────────────────────────────────────────────────────────────────

insert into public.tenant_quotas (tenant_id)
  select id from public.tenants
  on conflict (tenant_id) do nothing;

create or replace function public.seed_tenant_quota()
  returns trigger language plpgsql security definer
  set search_path = public as $$
begin
  insert into public.tenant_quotas (tenant_id)
    values (new.id)
    on conflict (tenant_id) do nothing;
  return new;
end $$;

revoke execute on function public.seed_tenant_quota() from public, anon, authenticated;

create trigger tenants_seed_quota
  after insert on public.tenants
  for each row execute function public.seed_tenant_quota();

-- ────────────────────────────────────────────────────────────────────
-- RLS — members can read; writes only via SECURITY DEFINER RPCs.
-- ────────────────────────────────────────────────────────────────────

alter table public.tenant_quotas enable row level security;
alter table public.tenant_quota_reservations enable row level security;

create policy tenant_quotas_member_read on public.tenant_quotas
  for select using (public.is_member_of(tenant_id));

create policy tenant_quota_reservations_member_read on public.tenant_quota_reservations
  for select using (public.is_member_of(tenant_id));

revoke insert, update, delete on public.tenant_quotas from authenticated;
revoke insert, update, delete on public.tenant_quota_reservations from authenticated;

-- ────────────────────────────────────────────────────────────────────
-- reserve_quota(p_tenant_id, p_actor_id, p_estimated_tokens, p_kind)
--
-- Returns jsonb {ok:true, reservation_id} or
-- {ok:false, reason:'tokens_exceeded'|'turns_exceeded'|'runs_exceeded'|'signals_exceeded'}
--
-- Concurrency contract (codex P2 #18):
--   1. SELECT FOR UPDATE on tenant_quotas serializes all callers for this tenant.
--   2. Inside the lock: roll period_start if stale, lazy-clean orphan
--      reservations >5min, then validate budget against caps.
--   3. If ok, increment counters + insert reservation row + commit.
--
-- signals_active is recomputed live (not from the cached column) so a
-- defensive overshoot can't slip through if the cache drifts.
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
  c_max_tokens     constant int := 1000000;
  c_max_turns      constant int := 1000;
  c_max_runs       constant int := 240;
  c_max_signals    constant int := 10;
  c_orphan_window  constant interval := interval '5 minutes';

  v_q              public.tenant_quotas%rowtype;
  v_signals_live   int;
  v_reservation_id uuid;
  v_today          date := current_date;
  v_recovered      int;
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

  -- Take the tenant-wide serialization lock.
  select * into v_q
    from public.tenant_quotas
   where tenant_id = p_tenant_id
   for update;

  if v_q.tenant_id is null then
    raise exception 'not_found: tenant_quotas row missing for tenant % — bootstrap trigger should have seeded',
      p_tenant_id using errcode = 'P0004';
  end if;

  -- Daily roll (codex P2 #11 — lazy reset).
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

  -- Lazy-clean orphan reservations (codex P2 #9). We hold the row lock,
  -- so no other caller can race this scan. Worst-case assumption: orphan
  -- consumed its estimated_tokens — we keep that budget held.
  update public.tenant_quota_reservations
     set reconciled_at = now(),
         actual_tokens = estimated_tokens
   where tenant_id     = p_tenant_id
     and reconciled_at is null
     and reserved_at   < now() - c_orphan_window;
  get diagnostics v_recovered = row_count;
  -- v_recovered is informational only — orphans already had their tokens
  -- deducted at reserve time; reconciliation here doesn't change the counter.

  -- Recompute live signal count for the signals_exceeded gate (defense-
  -- in-depth — the M4.3 enable action is the primary gate).
  select count(*) into v_signals_live
    from public.observer_signals
   where tenant_id = p_tenant_id
     and enabled = true
     and deleted_at is null;

  -- Update the cached column opportunistically (read-only consumers).
  if v_signals_live <> v_q.signals_active then
    update public.tenant_quotas
       set signals_active = v_signals_live,
           updated_at     = now()
     where tenant_id = p_tenant_id;
    v_q.signals_active := v_signals_live;
  end if;

  -- Budget checks. Order matters for the failure reason: tokens first
  -- (most likely), then per-kind counter, then signals (defensive).
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

  -- Reserve. Increment counters atomically with the reservation insert.
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
-- reconcile_quota(p_reservation_id, p_actual_tokens)
--
-- Idempotent: re-call after reconciliation is a no-op. Adjusts the
-- tenant counter by the (actual - estimated) delta and freezes the
-- reservation row.
-- ────────────────────────────────────────────────────────────────────

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
  v_delta   int;
begin
  if p_actual_tokens < 0 then
    raise exception 'invalid_input: actual_tokens must be >= 0' using errcode = 'P0006';
  end if;

  -- Lock the reservation. If already reconciled, idempotent no-op.
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

  -- Lock the tenant_quotas row to update the counter under serialization.
  perform 1 from public.tenant_quotas
    where tenant_id = v_r.tenant_id
    for update;

  update public.tenant_quotas
     set tokens_used = greatest(0, tokens_used + v_delta),
         updated_at  = now()
   where tenant_id   = v_r.tenant_id;

  update public.tenant_quota_reservations
     set reconciled_at = now(),
         actual_tokens = p_actual_tokens
   where id = p_reservation_id;

  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.reconcile_quota(uuid, int) from public, anon;
grant execute on function public.reconcile_quota(uuid, int) to authenticated;
