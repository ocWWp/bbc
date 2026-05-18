# Connection-Health Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface connector health on `/library/diagnostics` with an aggregated header + per-row Reconnect action, and notify admins via `inbox_items` when a connector transitions from healthy to broken.

**Architecture:** Detection + fanout entirely in the DB via an `AFTER UPDATE` trigger on `tenant_connectors` (no app-code changes to `updateSyncState` in `framework.ts` or `webhook-process.ts`). UI changes are read-only enhancements to the existing admin-only `/library/diagnostics` page. Reconnect button links to the Phase K install page.

**Tech Stack:** Next.js 16 / React 19 (App Router), TypeScript, Supabase (Postgres + RLS), vitest. Migration applied via Supabase MCP `apply_migration` to the remote project.

**Design source:** `docs/plans/2026-05-18-connection-health-design.md` (codex-reviewed 3 rounds, 8 [P1] → 1 [P1] folded in).

---

## Task 1: Extend TS types for new inbox kind + source_kind

**Files:**
- Modify: `apps/dashboard/src/lib/inbox/insert-inbox-item.ts` (lines 8 + 11 — the `kind` and `source_kind` unions)
- Modify: `apps/dashboard/src/lib/inbox/read-inbox.ts` (line 11 — the `source_kind` union; line 8 `kind` is `string` already, leave it)

**Step 1: Edit the `kind` union in `insert-inbox-item.ts`**

Change line 8 from:
```ts
kind: "flag_resolved" | "loop3_suggestion" | "mention";
```
to:
```ts
kind: "flag_resolved" | "loop3_suggestion" | "mention" | "connector_auth_expired" | "connector_error";
```

**Step 2: Edit the `source_kind` union in `insert-inbox-item.ts`**

Change line 11 from:
```ts
source_kind?: "queue_item" | "recommendation" | "memory_file";
```
to:
```ts
source_kind?: "queue_item" | "recommendation" | "memory_file" | "connector";
```

**Step 3: Edit the `source_kind` union in `read-inbox.ts`**

Change line 11 from:
```ts
source_kind: "queue_item" | "recommendation" | "memory_file" | null;
```
to:
```ts
source_kind: "queue_item" | "recommendation" | "memory_file" | "connector" | null;
```

**Step 4: Run type-check**

Run: `pnpm --filter @bbc/dashboard type-check`
Expected: PASS. (App code does not call `insertInboxItem` with the new kinds — only the DB trigger writes them. Reader code consumes `source_kind` as a switch fallback; widening adds 'connector' which existing switch cases will fall through on.)

**Step 5: Commit**

```bash
git add apps/dashboard/src/lib/inbox/insert-inbox-item.ts apps/dashboard/src/lib/inbox/read-inbox.ts
git commit -m "types(inbox): widen kind + source_kind unions for connector notifications"
```

---

## Task 2: Add `installPathFor` helper with unit test (TDD)

**Files:**
- Create: `apps/dashboard/src/lib/connectors/install-paths.ts`
- Create: `apps/dashboard/src/lib/connectors/install-paths.test.ts`

**Step 1: Write the failing test**

Create `apps/dashboard/src/lib/connectors/install-paths.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { installPathFor } from "./install-paths";

describe("installPathFor", () => {
  it("maps github to /library/install/github", () => {
    expect(installPathFor("github")).toBe("/library/install/github");
  });

  it("maps gmail to /library/install/google", () => {
    expect(installPathFor("gmail")).toBe("/library/install/google");
  });

  it("maps drive to /library/install/google", () => {
    expect(installPathFor("drive")).toBe("/library/install/google");
  });

  it("returns undefined for unknown connector_id", () => {
    expect(installPathFor("notion")).toBeUndefined();
    expect(installPathFor("linear")).toBeUndefined();
    expect(installPathFor("webhook-generic")).toBeUndefined();
    expect(installPathFor("")).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @bbc/dashboard vitest run src/lib/connectors/install-paths.test.ts`
Expected: FAIL — module './install-paths' not found.

**Step 3: Write minimal implementation**

Create `apps/dashboard/src/lib/connectors/install-paths.ts`:

```ts
// Maps a connector_id to its Phase K install page route. Returns undefined
// when no install page exists for that connector (e.g. notion, linear,
// generic webhook — callers should hide the Reconnect button in that case).
//
// Note that gmail and drive both resolve to /library/install/google
// because the OAuth grant is per-Google-project, not per-API.

export function installPathFor(connector_id: string): string | undefined {
  switch (connector_id) {
    case "github":
      return "/library/install/github";
    case "gmail":
    case "drive":
      return "/library/install/google";
    default:
      return undefined;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @bbc/dashboard vitest run src/lib/connectors/install-paths.test.ts`
Expected: PASS — 4 / 4.

**Step 5: Commit**

```bash
git add apps/dashboard/src/lib/connectors/install-paths.ts apps/dashboard/src/lib/connectors/install-paths.test.ts
git commit -m "feat(connectors): add installPathFor helper for diagnostics reconnect button"
```

---

## Task 3: Extract diagnostics header bucket math into a pure helper (TDD)

The page.tsx currently inlines display logic; extracting the three-bucket counting makes the math testable.

**Files:**
- Modify: `apps/dashboard/src/lib/connectors/read-diagnostics.ts` (add a new exported pure function at the bottom)
- Create: `apps/dashboard/src/lib/connectors/read-diagnostics.test.ts` (or extend if one exists — check first)

**Step 1: Check if a test file exists**

Run: `ls apps/dashboard/src/lib/connectors/read-diagnostics.test.ts 2>/dev/null && echo EXISTS || echo NEW`

If EXISTS: extend it. If NEW: create.

**Step 2: Write the failing test**

Append (or create) the following:

```ts
import { describe, it, expect } from "vitest";
import { computeHealthBuckets, type DiagnosticsRow } from "./read-diagnostics";

const mkRow = (last_sync_status: string | null): DiagnosticsRow => ({
  row_id: "r" + Math.random(),
  connector_id: "github",
  installed_at: "2026-01-01T00:00:00Z",
  last_sync_at: null,
  last_sync_status,
  last_sync_error: null,
  dlq_count: 0,
});

describe("computeHealthBuckets", () => {
  it("counts ok as healthy", () => {
    const b = computeHealthBuckets([mkRow("ok"), mkRow("ok")]);
    expect(b).toEqual({ healthy: 2, needs_attention: 0, never_synced: 0 });
  });

  it("counts auth_expired, error, partial, rate_limited as needs_attention", () => {
    const b = computeHealthBuckets([
      mkRow("auth_expired"),
      mkRow("error"),
      mkRow("partial"),
      mkRow("rate_limited"),
    ]);
    expect(b).toEqual({ healthy: 0, needs_attention: 4, never_synced: 0 });
  });

  it("counts null last_sync_status as never_synced", () => {
    const b = computeHealthBuckets([mkRow(null), mkRow(null)]);
    expect(b).toEqual({ healthy: 0, needs_attention: 0, never_synced: 2 });
  });

  it("handles empty input", () => {
    expect(computeHealthBuckets([])).toEqual({ healthy: 0, needs_attention: 0, never_synced: 0 });
  });

  it("classifies a mixed fleet", () => {
    const b = computeHealthBuckets([
      mkRow("ok"), mkRow("ok"), mkRow("ok"),
      mkRow("auth_expired"),
      mkRow(null),
    ]);
    expect(b).toEqual({ healthy: 3, needs_attention: 1, never_synced: 1 });
  });
});
```

**Step 3: Run test to verify it fails**

Run: `pnpm --filter @bbc/dashboard vitest run src/lib/connectors/read-diagnostics.test.ts`
Expected: FAIL — `computeHealthBuckets` not exported.

**Step 4: Implement the helper**

Append to `apps/dashboard/src/lib/connectors/read-diagnostics.ts`:

```ts
export type HealthBuckets = {
  healthy: number;
  needs_attention: number;
  never_synced: number;
};

export function computeHealthBuckets(rows: DiagnosticsRow[]): HealthBuckets {
  let healthy = 0, needs_attention = 0, never_synced = 0;
  for (const r of rows) {
    if (r.last_sync_status === null) never_synced++;
    else if (r.last_sync_status === "ok") healthy++;
    else needs_attention++;
  }
  return { healthy, needs_attention, never_synced };
}
```

**Step 5: Run test to verify it passes**

Run: `pnpm --filter @bbc/dashboard vitest run src/lib/connectors/read-diagnostics.test.ts`
Expected: PASS — 5 / 5.

**Step 6: Commit**

```bash
git add apps/dashboard/src/lib/connectors/read-diagnostics.ts apps/dashboard/src/lib/connectors/read-diagnostics.test.ts
git commit -m "feat(diagnostics): extract three-bucket health math into pure helper"
```

---

## Task 4: Render header card + Reconnect column on `/library/diagnostics`

**Files:**
- Modify: `apps/dashboard/src/app/library/diagnostics/page.tsx` (existing 128 lines; new imports, new header section between line 33 and 35, new column in the existing table)

**Step 1: Update imports at the top of the file**

Edit imports section to add:
```ts
import { computeHealthBuckets } from "@/lib/connectors/read-diagnostics";
import { installPathFor } from "@/lib/connectors/install-paths";
```

**Step 2: Render the three-bucket header card**

Immediately AFTER the `<header className="lib-diag-head">...</header>` block (around line 33), insert a new `<section className="lib-diag-section lib-diag-health">`:

```tsx
{(() => {
  const b = computeHealthBuckets(diag.connectors);
  const needsAttention = b.needs_attention > 0;
  return (
    <section className={`lib-diag-section lib-diag-health ${needsAttention ? "warn" : ""}`}>
      <h2>Health</h2>
      <ul className="lib-diag-buckets">
        <li><strong>{b.healthy}</strong> healthy</li>
        <li className={needsAttention ? "warn" : ""}><strong>{b.needs_attention}</strong> need attention</li>
        <li><strong>{b.never_synced}</strong> never synced</li>
      </ul>
    </section>
  );
})()}
```

**Step 3: Add "actions" header + cell to the installed-connectors table**

Find the `<thead>` block (around line 79-87) and add a final `<th>actions</th>` after `<th>last error</th>`.

Find the row body (around line 89-105) and add this as the last `<td>` per row:

```tsx
<td>
  {(c.last_sync_status === "auth_expired" && installPathFor(c.connector_id)) ? (
    <a className="btn-reconnect" href={installPathFor(c.connector_id)}>Reconnect</a>
  ) : null}
</td>
```

Only `auth_expired` shows the button per the design (reinstall doesn't fix transient/partial conditions).

**Step 4: Type-check**

Run: `pnpm --filter @bbc/dashboard type-check`
Expected: PASS.

**Step 5: Run full vitest suite to confirm no regression**

Run: `pnpm --filter @bbc/dashboard vitest run`
Expected: previous count + Task 2 + Task 3 new tests all PASS. No existing test breaks (no existing test exercises the page.tsx render shape directly).

**Step 6: Commit**

```bash
git add apps/dashboard/src/app/library/diagnostics/page.tsx
git commit -m "feat(diagnostics): three-bucket health header + per-row Reconnect button"
```

---

## Task 5: Write migration `0061_connector_broken_notify.sql`

**Files:**
- Create: `apps/dashboard/supabase/migrations/0061_connector_broken_notify.sql`

**Step 1: Create the migration file with the full design SQL**

Verbatim from the design doc:

```sql
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
```

**Step 2: Commit the migration file (uncommitted, not yet applied)**

```bash
git add apps/dashboard/supabase/migrations/0061_connector_broken_notify.sql
git commit -m "feat(migration): 0061 — connector-broken admin notification trigger"
```

---

## Task 6: Apply migration to staging Supabase + smoke

The migration applies to the live staging Postgres via the Supabase MCP. After applying, verify the CHECK widens cleanly and the trigger fires on a controlled UPDATE.

**Step 1: Apply migration**

Use the Supabase MCP tool `apply_migration` with:
- `name`: `0061_connector_broken_notify`
- `query`: contents of `apps/dashboard/supabase/migrations/0061_connector_broken_notify.sql`

If the pre-flight `RAISE EXCEPTION` fires, query `inbox_items` for unknown kinds, decide whether to widen the CHECK further or update those rows, then retry.

**Step 2: Verify PostgREST schema reloaded**

The migration ends with `NOTIFY pgrst, 'reload schema'`. Wait ~5s, then verify the new `source_kind='connector'` value is accepted by attempting a test insert through the PostgREST layer (just inspect via Supabase MCP `execute_sql` — no real insert needed at this step).

**Step 3: Smoke — controlled trigger fire**

Use Supabase MCP `execute_sql` to run, against the staging project:

```sql
-- Identify the test tenant + admin (8azi: oscarchow@8azi.io).
-- Substitute the real tenant_id; confirm via:
--   select id, slug from tenants where slug like '%8azi%';

-- Snapshot: how many inbox_items for the admin right now?
SELECT count(*) AS before FROM inbox_items
WHERE user_id = (select user_id from tenant_members where role='admin' AND tenant_id = '<TENANT_ID>' LIMIT 1)
  AND source_kind = 'connector';

-- Find a tenant_connectors row in 'ok' state (or insert a fake one if none).
-- Then UPDATE it to 'auth_expired'.
UPDATE tenant_connectors
SET last_sync_status = 'auth_expired',
    last_sync_at = now(),
    last_sync_error = 'smoke test: simulated 401'
WHERE id = '<CONNECTOR_ROW_ID>';

-- Verify: exactly one new row per admin in inbox_items.
SELECT kind, source_kind, title, body, created_at
FROM inbox_items
WHERE source_kind = 'connector'
  AND tenant_id = '<TENANT_ID>'
ORDER BY created_at DESC
LIMIT 5;

-- Reset state for repeatability:
UPDATE tenant_connectors
SET last_sync_status = 'ok', last_sync_error = NULL
WHERE id = '<CONNECTOR_ROW_ID>';

-- (Optional) clean up the test inbox rows:
DELETE FROM inbox_items WHERE source_kind = 'connector' AND tenant_id = '<TENANT_ID>';
```

Expected:
- One row per admin with `kind='connector_auth_expired'`, `source_kind='connector'`, title includes the connector_id.
- A second `UPDATE ... SET last_sync_status='auth_expired'` (same value) inserts NO new rows (WHEN clause guards `OLD IS DISTINCT FROM NEW`).
- UPDATE to `ok`, then back to `auth_expired`, inserts new rows (real transition).

**Step 4: Record smoke results in the design doc + commit**

Append a `## Migration smoke` section to `docs/plans/2026-05-18-connection-health-design.md` with the verified results.

```bash
git add docs/plans/2026-05-18-connection-health-design.md
git commit -m "docs(connection-health): migration 0061 smoke verified on staging"
```

---

## Task 7: Type-check + full test suite + dev server visual check

**Step 1: Type-check**

Run: `pnpm --filter @bbc/dashboard type-check`
Expected: PASS.

**Step 2: Full test suite**

Run: `pnpm --filter @bbc/dashboard vitest run`
Expected: previous count + Task 2 (4 new) + Task 3 (5 new) = previous + 9 PASS. No regressions.

**Step 3: Start dev server + visual smoke**

Run: `pnpm --filter @bbc/dashboard dev` (background)
Then via chrome-devtools MCP:
- Sign in as admin (`oscarchow@8azi.io`).
- Navigate to `/library/diagnostics`.
- Verify the header card shows `X healthy · Y need attention · N never synced`.
- After Task 6 step 3 (the simulated auth_expired UPDATE that was reset), trigger another simulated UPDATE so a row is visibly `auth_expired`, refresh `/library/diagnostics`.
- Verify a **Reconnect** button appears in the actions column on that row.
- Click Reconnect → should navigate to `/library/install/<route>` (the existing Phase K install page).
- Reset the row to `ok` and clean up.

Screenshots into `docs/plans/2026-05-18-connection-health-smoke/`.

**Step 4: Stop dev server**

---

## Task 8: Codex review of the implemented diff

Per the codex skill at `~/.claude/skills/codex/SKILL.md`.

Run: `codex review --base main`

Expected: PASS (no [P1]). The design already went 3 rounds; the implementation should match the locked design.

If any [P1] surfaces: fix, re-run, repeat.

---

## Task 9: Push + PR

**Step 1: Push**

```bash
git push
```

**Step 2: Open PR**

```bash
gh pr create --title "feat: connection-health dashboard (admin notifications + reconnect)" --body "$(cat <<'EOF'
## Summary
- AFTER UPDATE trigger on \`tenant_connectors\` fans out one \`inbox_items\` row per admin when \`last_sync_status\` transitions ok→broken (auth_expired/error)
- New health header on \`/library/diagnostics\`: X healthy · Y need attention · N never synced
- Per-row Reconnect button for \`auth_expired\` rows, links to existing Phase K install page (github → /library/install/github; gmail|drive → /library/install/google)
- No app-code changes to updateSyncState in framework.ts or webhook-process.ts — trigger catches both callsites

## Design
docs/plans/2026-05-18-connection-health-design.md (codex-reviewed 3 rounds, 8 P1 → 1 P1 folded in)

## Test plan
- [ ] vitest unit: installPathFor exhaustive (4 cases)
- [ ] vitest unit: computeHealthBuckets 3 buckets (5 cases)
- [ ] Migration applied to staging without RAISE EXCEPTION
- [ ] Smoke: simulated ok→auth_expired UPDATE produces inbox row per admin
- [ ] Smoke: repeated UPDATE with same value produces no new rows
- [ ] Smoke: /library/diagnostics renders health header + Reconnect link
- [ ] Codex review PASS

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3: Note the PR URL for the user**

---

## Done

Final shape: 1 migration, 1 new helper module + test, 1 new pure helper + test extension, 1 page edit, 2 TS type widenings. No changes to `updateSyncState` in either copy. Trigger handles detection, fanout, durability, race, and dedup. Reconnect leverages the Phase K install page that just shipped.
