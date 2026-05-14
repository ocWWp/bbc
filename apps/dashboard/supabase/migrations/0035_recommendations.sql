-- v1.5 launch plan D-W1-2 (4/5): recommendations.
--
-- Loop 3 v1 surface. The rule-based recommender (lib/loop3/recommend.ts,
-- W4-2) writes rows here; the Library's "Recommended for you" carousel
-- reads pending rows. State machine: pending -> installed | dismissed | snoozed.
--
-- Recommendations are NOT memory governance proposals -- they're
-- install/dismiss decisions about extensibility, so they live in their own
-- table and never touch the /queue. See ADR-0009 §scope and the v3 design.
--
-- Spam controls:
--   - dedupe: partial unique index on (tenant_id, target_kind, target_id)
--     WHERE state='pending' allows at most one pending per target
--   - cooldown: enforced in the recommender at generation time by reading
--     dismissed_at of any prior dismissed row for the same target
--   - cap: max 5 active pending per tenant (no-op at cap, enforced in
--     lib/loop3/lifecycle.ts, W4-3)
--
-- RLS:
--   - Members read their own tenant's rows
--   - Members UPDATE their own rows (to dismiss / snooze / mark installed)
--   - INSERTs are service-role only -- the recommender runs without auth.uid()
--
-- Spec: docs/plans/2026-05-12-bbc-launch-design.md §5
-- ADR:  memory/decisions/0009-loop-3-scope.md

create table public.recommendations (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  target_kind        text not null check (target_kind in ('skill', 'connector', 'provider')),
  target_id          text not null,
  reason_code        text not null,
  reason_human       text not null,
  state              text not null default 'pending' check (state in ('pending', 'installed', 'dismissed', 'snoozed')),
  recommended_at     timestamptz not null default now(),
  installed_at       timestamptz,
  dismissed_at       timestamptz,
  snoozed_until      timestamptz,
  observed_signal    jsonb,
  created_by_system  text not null default 'loop3-v1'
);

create unique index recommendations_pending_unique_idx
  on public.recommendations (tenant_id, target_kind, target_id)
  where state = 'pending';

create index recommendations_tenant_state_idx
  on public.recommendations (tenant_id, state, recommended_at desc);

alter table public.recommendations enable row level security;

create policy recommendations_member_read on public.recommendations
  for select using (public.is_member_of(tenant_id));

create policy recommendations_member_update on public.recommendations
  for update using (public.is_member_of(tenant_id));
