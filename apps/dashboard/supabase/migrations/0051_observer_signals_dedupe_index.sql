-- M5.2 codex follow-up — observer_signals dedupe at the DB.
--
-- The setup endpoint at apps/dashboard/src/app/api/observer/signals/setup/route.ts
-- does a read-before-insert dedupe via .contains(config_jsonb, ...). Under
-- concurrent setup requests two callers can both pass the read and insert
-- duplicate non-deleted rows. v1.6 enforces dedupe at the DB layer with a
-- unique partial index on (tenant_id, signal_type, metric) WHERE
-- deleted_at IS NULL.
--
-- The setup endpoint stays — it short-circuits the round trip and gives
-- a friendly response when the signal already exists — but the index is
-- now the authoritative guarantee.

create unique index if not exists
  observer_signals_tenant_metric_unique
  on public.observer_signals (
    tenant_id,
    signal_type,
    (config_jsonb ->> 'metric')
  )
  where deleted_at is null;
