-- v1.5 launch plan D-W1-2 (5/5): webhook_dead_letters.
--
-- DLQ for the generic webhook connector. Any payload that fails verification
-- (bad signature, stale timestamp, oversized, mapping rejected, malformed
-- JSON) is recorded here so the tenant can debug without us replaying the
-- payload. Body is intentionally NOT stored -- only its sha256 -- to avoid
-- holding arbitrary user data we can't audit.
--
-- Receiver runs without auth.uid() (it's a public webhook endpoint), so
-- inserts are service-role only. Members read their own tenant's rows for
-- the /library/diagnostics page (W6-4).
--
-- Spec: docs/plans/2026-05-12-bbc-launch-design.md §4

create table public.webhook_dead_letters (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  connector_id    uuid not null references public.tenant_connectors(id) on delete cascade,
  received_at     timestamptz not null default now(),
  payload         jsonb,
  reason          text not null check (reason in (
                    'invalid_signature',
                    'expired_timestamp',
                    'oversized',
                    'mapping_rejected',
                    'malformed_json',
                    'rate_limited'
                  )),
  raw_body_sha256 text
);

create index webhook_dead_letters_tenant_idx
  on public.webhook_dead_letters (tenant_id, received_at desc);

create index webhook_dead_letters_connector_idx
  on public.webhook_dead_letters (connector_id, received_at desc);

alter table public.webhook_dead_letters enable row level security;

create policy webhook_dead_letters_member_read on public.webhook_dead_letters
  for select using (public.is_member_of(tenant_id));
