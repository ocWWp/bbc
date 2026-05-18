# Connection-health dashboard — design

**Date:** 2026-05-18
**Branch:** `feat/phase-k-install` (this is the next phase after Phase K install-flow lands; design predates the post-K branch)
**Status:** Design approved. Implementation plan pending via `superpowers:writing-plans`.

## Why

From the v1.8 pre-launch audit's deferred-gaps table, **Connection-health dashboard** was the loudest user-named gap. After Phase K shipped install/reinstall flows for GitHub/Gmail/Drive, the natural follow-on is: when those connectors break (expired token, repeated sync errors), the admin needs to (a) find out, (b) recover. Today, `tenant_connectors.last_sync_status` already records `auth_expired` / `error`, and `/library/diagnostics` already displays it — but there is no notification when state flips, no reconnect action, and no top-line "how healthy is the system."

## Scope (user-locked decisions)

1. **UI surface:** in-place upgrade of `/library/diagnostics`. Stays admin-only (404 for non-admins via `notFound()` — that gate stays). No new routes, no new tabs.
2. **Notification fanout:** when `tenant_connectors.last_sync_status` transitions from healthy (or never-synced) to broken (`auth_expired` or `error`), insert one `inbox_items` row per tenant admin (`tenant_members.role = 'admin'`). Channel = `from_bbc`. Acknowledged that non-admins do NOT learn via inbox — `inbox_items` is per-user RLS; "team-wide visibility" was not how the table works. Non-admins find out by symptom or by asking.
3. **Reconnect action:** plain anchor styled as a button pointing at the existing Phase K install page (`/library/install/<route>`). No server action, no inline re-OAuth. Phase K's install page already does atomic reinstall (rewrites mapping, sets `revoked_at` on prior row, inserts new `external_accounts` row).

## What this does NOT add

- No recovered/restored notification (`ok → broken` notifies; `broken → ok` is silent; admin sees status pill flip on their next visit). YAGNI.
- No daemon/heartbeat. Detection is reactive on the next sync attempt. Existing connectors sync regularly enough.
- No per-connector_id ownership on `tenant_connectors`. Notifications go to all admins.
- No banner on other pages. Inbox is the single notification surface.
- No reconnect button for `partial` / `rate_limited` states — reinstall doesn't fix transient or partial-consent conditions.

## Architecture

Detection + fanout happens entirely in the database via a trigger on `tenant_connectors`. No app-code changes in `framework.ts` or `webhook-process.ts`. This sidesteps three problems that an app-side implementation would have:

- **Two callsites:** both `framework.ts` and `webhook-process.ts` have their own `updateSyncState`. A trigger catches both regardless of which code path called the UPDATE.
- **Durability:** the trigger fires in the same transaction as the row UPDATE. If the fanout insert fails, the whole UPDATE rolls back, the row stays `ok`, and the next sync retries. No silent-loss path.
- **Race condition:** Postgres row-locks `tenant_connectors.<id>` during UPDATE. The trigger `WHEN` clause only fires on `OLD.last_sync_status IS DISTINCT FROM NEW.last_sync_status AND prior IN (ok, NULL) AND new IN (auth_expired, error)`. Concurrent transactions serialize on the row lock; the second one sees prior = broken and the WHEN clause is false. No double-notification, no `ON CONFLICT` required.

## Three changes

### 1. Migration `apps/dashboard/supabase/migrations/0061_connector_broken_notify.sql`

```sql
-- a) Widen source_kind CHECK to include all values from 0043 + 0044 + new 'connector'.
ALTER TABLE public.inbox_items DROP CONSTRAINT IF EXISTS inbox_items_source_kind_check;
ALTER TABLE public.inbox_items ADD CONSTRAINT inbox_items_source_kind_check
  CHECK (source_kind IN (
    'queue_item','recommendation','memory_file',           -- 0043
    'slack','email','linear','github',                     -- 0044 (drafted, may be applied)
    'connector'                                            -- 0061 (this migration)
  ));

-- b) Add kind CHECK. 0043 has no kind CHECK; pre-flight fails if existing rows have unknown values.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.inbox_items
             WHERE kind NOT IN ('flag_resolved','loop3_suggestion','mention',
                                'connector_auth_expired','connector_error')) THEN
    RAISE EXCEPTION 'inbox_items has rows with unknown kind values; review before adding CHECK';
  END IF;
END $$;
ALTER TABLE public.inbox_items ADD CONSTRAINT inbox_items_kind_check
  CHECK (kind IN ('flag_resolved','loop3_suggestion','mention',
                  'connector_auth_expired','connector_error'));

-- c) Trigger function — fanout to admins on ok→broken transition.
CREATE OR REPLACE FUNCTION public.notify_connector_broken()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind text; v_title text; v_body text;
BEGIN
  v_kind := CASE NEW.last_sync_status
    WHEN 'auth_expired' THEN 'connector_auth_expired'
    WHEN 'error' THEN 'connector_error' END;
  IF v_kind IS NULL THEN RETURN NEW; END IF;
  v_title := CASE v_kind
    WHEN 'connector_auth_expired' THEN NEW.connector_id || ' connection expired — reconnect required'
    WHEN 'connector_error' THEN NEW.connector_id || ' sync hit an error' END;
  v_body := coalesce(NEW.last_sync_error,
    CASE v_kind
      WHEN 'connector_auth_expired' THEN 'Token rejected by upstream. An admin needs to reconnect.'
      WHEN 'connector_error' THEN 'See /library/diagnostics for details.' END);
  INSERT INTO public.inbox_items (tenant_id, user_id, channel, kind, title, body, source_kind)
  SELECT NEW.tenant_id, tm.user_id, 'from_bbc', v_kind, v_title, v_body, 'connector'
  FROM public.tenant_members tm
  WHERE tm.tenant_id = NEW.tenant_id AND tm.role = 'admin';
  RETURN NEW;
END; $$;

-- d) Trigger on tenant_connectors.last_sync_status transitions.
DROP TRIGGER IF EXISTS notify_connector_broken_trig ON public.tenant_connectors;
CREATE TRIGGER notify_connector_broken_trig
AFTER UPDATE OF last_sync_status ON public.tenant_connectors
FOR EACH ROW
WHEN (OLD.last_sync_status IS DISTINCT FROM NEW.last_sync_status
      AND NEW.last_sync_status IN ('auth_expired','error')
      AND (OLD.last_sync_status IS NULL OR OLD.last_sync_status = 'ok'))
EXECUTE FUNCTION public.notify_connector_broken();

NOTIFY pgrst, 'reload schema';
```

### 2. UI — `apps/dashboard/src/app/library/diagnostics/page.tsx`

- New top header card with three buckets:
  - **X healthy** = `last_sync_status = 'ok'` only
  - **Y need attention** = `last_sync_status IN ('auth_expired','error','partial','rate_limited')`
  - **N never synced** = `last_sync_status IS NULL`
  - Yellow affordance when Y > 0.
- Per-row "Reconnect" link styled as a button. Shown when:
  - `last_sync_status = 'auth_expired'` (only — reinstall doesn't fix transient/partial conditions)
  - AND `installPathFor(connector_id)` is defined.
- No new lib queries; `readDiagnostics()` already returns `last_sync_status` per row.

### 3. New helper + TS type widening

**`apps/dashboard/src/lib/connectors/install-paths.ts`** (new):
```ts
export function installPathFor(connector_id: string): string | undefined {
  switch (connector_id) {
    case "github": return "/library/install/github";
    case "gmail":
    case "drive":  return "/library/install/google";
    default:       return undefined;
  }
}
```

**`apps/dashboard/src/lib/inbox/insert-inbox-item.ts`:** extend `kind` union with `'connector_auth_expired' | 'connector_error'`; extend `source_kind` union with `'connector'`.

**`apps/dashboard/src/lib/inbox/read-inbox.ts`:** same widening on the reader side.

**No inbox renderer change** — UI renders title/body verbatim (verified by codex).

## Tests

- **vitest unit:** `installPathFor` exhaustive cases (github, gmail, drive, unknown).
- **vitest unit:** diagnostics page header math — 3 buckets correctly counted from a fixture covering ok/auth_expired/error/partial/rate_limited/null.
- **SQL integration test** (in-DB, via migration runner or pgTAP-style):
  - Insert **two** admin `tenant_members` + a `tenant_connectors` row in `ok` state.
  - UPDATE to `auth_expired`. Assert exactly 2 `inbox_items` rows (one per admin) with `kind='connector_auth_expired'`, `source_kind='connector'`.
  - UPDATE to `auth_expired` again (no-op transition). Assert no new rows (`WHEN` clause prevents).
  - UPDATE to `ok` then back to `auth_expired`. Assert 2 new rows (the prior incident was resolved; the new break is a new transition).
  - UPDATE to `error` from `ok`. Assert `kind='connector_error'`.
  - UPDATE to `partial` from `ok`. Assert no rows (not in WHEN clause).

## Codex review trail

Three rounds with `codex exec resume`. Findings progression: 8 [P1] → 3 [P1] → 1 [P1] (final [P1] was a missing 4-value addition to the source_kind CHECK enumeration, folded into this design).

Round-1 [P1]s resolved by architectural moves:
- Wrong extension point (`recordSyncOutcome` → `updateSyncState` × 2 callsites) → resolved by moving to DB trigger.
- `source_kind: "system"` invalid → resolved by using `source_kind = 'connector'` and widening CHECK.
- Per-user RLS contradicts "team-wide visibility" → scope walked back to admin fanout.
- Admin fanout no idempotency / update-before-insert lossy → resolved by same-transaction trigger.
- Race condition → resolved by row lock + WHEN-clause dedup.
- `/library/install/<connector>` 404s for gmail/drive → resolved by `installPathFor()` helper.
- Migration described wrong CHECK → resolved by reading 0043 and adding `kind` CHECK from scratch.

Round-2 [P1]s resolved by dropping `source_external_id`:
- Missing column in 0043 → no longer needed (row lock + WHEN clause provide dedup).
- Field-lock trigger update from 0043 not addressed → no longer needed.
- `SECURITY DEFINER` without `SET search_path` → fixed.

Round-3 [P1] folded in:
- `source_kind` CHECK widening must preserve 0044's values for fresh DBs that apply 0044 before 0061 → CHECK now lists all (0043 + 0044 + 'connector').

## Open items deferred (not blocking ship)

- Could add a deep link from inbox items to `/library/diagnostics` (codex [P2]). Today the title carries the connector name; the body says "see /library/diagnostics." Click-through is text reference, not a hyperlink.
- Could add notification kind for `connector_recovered` (broken → ok) for closure. YAGNI for v1.
- Reconnect button for `error` state: codex argued "consider auth_expired-only" — adopted. If `error` turns out to need a reconnect option in practice, revisit.

## Next step

Invoke `superpowers:writing-plans` against this design doc to produce the implementation plan.
