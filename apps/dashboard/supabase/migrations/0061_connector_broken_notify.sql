-- 0061 — Connector-health admin notifications.
--
-- When tenant_connectors.last_sync_status transitions from healthy
-- (ok or NULL) to broken (auth_expired or error), insert one inbox_items
-- row per tenant admin via an AFTER UPDATE trigger. The trigger runs in
-- the same transaction as the row update; Postgres row-locks
-- tenant_connectors during UPDATE, and the WHEN clause prevents
-- duplicate notifications on broken→broken updates.
--
-- See docs/plans/2026-05-18-connection-health-design.md for the full
-- design + codex review trail (8 P1 → 1 P1, all addressed).

-- a) Widen source_kind CHECK. Lists all valid values across 0043 (applied),
--    0044 (drafted, may be applied before 0061 on fresh DBs), and the new
--    'connector' value introduced here.
ALTER TABLE public.inbox_items DROP CONSTRAINT IF EXISTS inbox_items_source_kind_check;
ALTER TABLE public.inbox_items ADD CONSTRAINT inbox_items_source_kind_check
  CHECK (source_kind IN (
    'queue_item','recommendation','memory_file',
    'slack','email','linear','github',
    'connector'
  ));

-- b) Add a kind CHECK. 0043 ships none; pre-flight RAISE if existing rows
--    contain values outside the planned union.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.inbox_items
    WHERE kind NOT IN (
      'flag_resolved','loop3_suggestion','mention',
      'connector_auth_expired','connector_error'
    )
  ) THEN
    RAISE EXCEPTION 'inbox_items has rows with unknown kind values; review before adding CHECK';
  END IF;
END $$;
ALTER TABLE public.inbox_items DROP CONSTRAINT IF EXISTS inbox_items_kind_check;
ALTER TABLE public.inbox_items ADD CONSTRAINT inbox_items_kind_check
  CHECK (kind IN (
    'flag_resolved','loop3_suggestion','mention',
    'connector_auth_expired','connector_error'
  ));

-- c) Trigger function: fanout one inbox row per tenant admin.
CREATE OR REPLACE FUNCTION public.notify_connector_broken()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_title text;
  v_body text;
BEGIN
  v_kind := CASE NEW.last_sync_status
    WHEN 'auth_expired' THEN 'connector_auth_expired'
    WHEN 'error' THEN 'connector_error'
    ELSE NULL
  END;
  IF v_kind IS NULL THEN
    RETURN NEW;
  END IF;
  v_title := CASE v_kind
    WHEN 'connector_auth_expired' THEN NEW.connector_id || ' connection expired — reconnect required'
    WHEN 'connector_error' THEN NEW.connector_id || ' sync hit an error'
  END;
  v_body := coalesce(NEW.last_sync_error,
    CASE v_kind
      WHEN 'connector_auth_expired' THEN 'Token rejected by upstream. An admin needs to reconnect.'
      WHEN 'connector_error' THEN 'See /library/diagnostics for details.'
    END);
  INSERT INTO public.inbox_items (
    tenant_id, user_id, channel, kind, title, body, source_kind
  )
  SELECT
    NEW.tenant_id,
    tm.user_id,
    'from_bbc',
    v_kind,
    v_title,
    v_body,
    'connector'
  FROM public.tenant_members tm
  WHERE tm.tenant_id = NEW.tenant_id
    AND tm.role = 'admin';
  RETURN NEW;
END;
$$;

-- d) Trigger fires ONLY on transition from healthy (ok/null) to broken
--    (auth_expired/error). Row lock + WHEN clause = dedup; no ON CONFLICT
--    needed.
DROP TRIGGER IF EXISTS notify_connector_broken_trig ON public.tenant_connectors;
CREATE TRIGGER notify_connector_broken_trig
AFTER UPDATE OF last_sync_status ON public.tenant_connectors
FOR EACH ROW
WHEN (
  OLD.last_sync_status IS DISTINCT FROM NEW.last_sync_status
  AND NEW.last_sync_status IN ('auth_expired', 'error')
  AND (OLD.last_sync_status IS NULL OR OLD.last_sync_status = 'ok')
)
EXECUTE FUNCTION public.notify_connector_broken();

NOTIFY pgrst, 'reload schema';
