# v1.6 per-table migration policy

**Purpose.** Lock the RLS, retention, mutation, and cascade policy for every new table v1.6 introduces, before the migrations land. Codex review of the v1.6 design doc flagged the "per-table mutation policy" as a PLAN-level requirement (#2, #12). This document is referenced from `memory/decisions/0009-loop-3-scope.md`'s v1.6 amendment and from `docs/plans/2026-05-15-agentic-home-PLAN.md` M0.4.

**Tables in scope.** Five new tables, all created by migrations 0045–0048:
1. `home_sessions` (M2.1, migration 0045)
2. `home_turns` (M2.1, migration 0045)
3. `observer_signals` (M3.1, migration 0046)
4. `observer_runs` (M3.1, migration 0046)
5. `tenant_quotas` (M4.1, migration 0048)

**Existing patterns referenced.** All five policies extend conventions already established in:
- `apps/dashboard/supabase/migrations/0007_operations_log_bindings_proposals_audit.sql` — append-only audit pattern via `block_top_level_log_mutation()` + `block_top_level_audit_mutation()` triggers (using `pg_trigger_depth() = 1` to allow SECURITY DEFINER RPC-internal mutations while blocking direct UPDATE/DELETE from the service role).
- `apps/dashboard/supabase/migrations/0039_rbac_rpc_gates.sql` — `is_operator_of(tenant)` + `is_member_of(tenant)` gates used by `accept_proposal()` / `reject_proposal()`. v1.6 RPCs reuse these gates.
- `apps/dashboard/supabase/migrations/0040_propose_change.sql` — the existing queue-write RPC v1.6 observer proposals route through.
- `apps/dashboard/supabase/migrations/0042_loop3_teammate_visibility.sql` — pattern for member-scoped (not just tenant-scoped) read policies.

**Hard rule across all five tables.** Every state change in user-facing flows appends an `operations_log` row using the existing version-monotonic pattern (`select coalesce(max(v), 0) + 1` per tenant). v1.6 does not introduce a parallel audit table. Observer ephemera live in `observer_runs` itself (which IS the trace), not in operations_log; user-driven actions (enable/disable/run-now/archive) DO log.

**Two existing constraints this doc inherits but re-states for clarity:**

- **memory_files.status DB enum is `('draft', 'active', 'archived')`** per migration 0017_memory_items_schema.sql. There is no `proposed` value. This document's references to memory-row "status" map to this enum. Frontmatter-level lifecycle (`accepted`, `proposed`, `superseded`, `archived`) is independent of the DB column. The observation supertag spec (M0.5, `memory/_schema.md`) pins this mapping: an `observation` memory row exists at DB-level `status='active'` once `accept_proposal_observation()` runs; it never exists with DB-level `status='draft'` or while the queue item is still pending.
- **memory_type DB enum currently lacks `observation`** per migrations 0017 + 0022 (which added `source_artifact` and `note`). M3 migration 0047 MUST include `alter type public.memory_type add value if not exists 'observation';` before its `insert into memory_files (type, ...) values ('observation', ...)` call, otherwise `accept_proposal_observation()` fails on the enum cast.

**No secrets in stored adapter state.** Across all five tables, jsonb payloads stored as part of normal operation (`observer_signals.config_jsonb`, `observer_runs.window_snapshot`, `home_turns.content_jsonb`, `tenant_quota_reservations` payload, any proposal body or frontmatter) MUST NOT contain: upstream API tokens, OAuth refresh tokens, BYOK provider keys, or any raw upstream credential. Connector credentials live in the existing secrets vault per `apps/dashboard/src/lib/encryption.ts` and are referenced by ID only. Adapter implementations are responsible for stripping credential material before any DB write. Codex review of M0 flagged this explicitly (codex 2026-05-15 P2 #8).

---

## 1. `home_sessions`

**Purpose.** Per-user rolling conversation containers on /home. New session = archive old + start fresh. 30-day inactivity auto-archive. Pure session state — never enters the memory contract (per ADR-0008 §Loop 2 mapping).

### Schema

```sql
create table home_sessions (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  started_at         timestamptz not null default now(),
  last_activity_at   timestamptz not null default now(),
  archived_at        timestamptz
);

create index home_sessions_tenant_user_idx
  on home_sessions(tenant_id, user_id, archived_at);
```

### RLS

Follows the convention established by migrations 0003 (`is_member_of`), 0007 (member-scoped reads), and 0020 (`is_member_of` + `created_by = auth.uid()` for self-write). No GUC-based tenant scoping — BBC's existing RLS pattern is **function-call gates**, not `current_setting('app.current_tenant_id')` cookies. Codex review of M0 flagged this explicitly (codex 2026-05-15 P1 #1) — the GUC pattern does not match the rest of the schema and would produce zero-row reads under the current `@supabase/ssr` client.

```sql
alter table home_sessions enable row level security;

-- Read: a user can only see their own sessions, scoped to a tenant they belong to.
create policy home_sessions_self_read on home_sessions
  for select using (
    public.is_member_of(tenant_id) and user_id = auth.uid()
  );

-- Insert: same shape — same user, same tenant.
create policy home_sessions_self_insert on home_sessions
  for insert with check (
    public.is_member_of(tenant_id) and user_id = auth.uid()
  );

-- Update: same shape. Used to set last_activity_at, archived_at.
create policy home_sessions_self_update on home_sessions
  for update using (
    public.is_member_of(tenant_id) and user_id = auth.uid()
  ) with check (
    public.is_member_of(tenant_id) and user_id = auth.uid()
  );

-- No DELETE policy — soft-archive only; hard-delete happens via parent cascade.
```

**Plain English.** A user can only see and modify their own sessions, scoped to a tenant they're a member of. Cross-user reads are blocked by RLS at the DB layer, not by app code.

### Mutable vs append-only

- **Append-only on insert:** `id`, `tenant_id`, `user_id`, `started_at`.
- **Mutable:** `last_activity_at` (updated on every turn), `archived_at` (NULL → timestamp when archived; never unset).

No DELETE policy; rows are soft-archived via `archived_at`. Hard-delete only happens through `ON DELETE CASCADE` from the parent tenant or user.

### RPC ownership

- **Insert/update happens through `src/lib/home/sessions.ts` helpers**, not a dedicated RPC. These run under the authenticated user's cookie session via the `@supabase/ssr` server client. RLS gates correctness.
- No SECURITY DEFINER function for home_sessions in v1.6. (If we add cross-tenant admin audit later, that's a new RPC.)

### Retention

- **Active rows:** retained as long as the user + tenant exist.
- **Archived rows (`archived_at IS NOT NULL`):** retained 90 days, then a future cleanup job (out of v1.6 scope) hard-deletes. v1.6 just sets `archived_at`; no cleanup yet.
- **Auto-archive trigger:** sessions with `last_activity_at < now() - interval '30 days'` get `archived_at = now()` via a daily Cloudflare Worker (deferred to v1.7 along with cron).

### Tenant-deletion cascade

`ON DELETE CASCADE` from `tenants(id)` removes all sessions for that tenant. `ON DELETE CASCADE` from `auth.users(id)` removes all sessions for that user. Both cascades chain into `home_turns` (which references `home_sessions(id)`).

### Observability

- **operations_log entry on:**
  - Session archive (manual or auto) — `action='home_session_archive'`, `target=session_id`, `payload={reason: 'user'|'auto'}`.
- **No operations_log entry on:**
  - Session create (high-frequency, every fresh /home visit potentially; would flood the log).
  - `last_activity_at` updates (every turn).

If audit is needed later for create events, add it when implementing the auto-archive job — defer the volume question until real traffic exists.

### Test cases (M2 acceptance)

1. **RLS — cross-user read returns 0 rows.** Insert session as user A; query as user B (same tenant). Expect empty.
2. **RLS — cross-tenant read returns 0 rows.** Insert session as user A in tenant T1; switch `app.current_tenant_id` to T2, query. Expect empty.
3. **Tenant cascade.** Delete tenant T1; verify all home_sessions + home_turns for T1 are gone.
4. **User cascade.** Delete user A; verify all home_sessions + home_turns for user A are gone.

---

## 2. `home_turns`

**Purpose.** Persistent transcript of every user/agent turn within a session. Survives reload, abort, network failure (per design doc §"Turn persistence lifecycle"). Status lifecycle: `in_progress` → `completed` | `aborted` | `failed`.

### Schema

```sql
create table home_turns (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references home_sessions(id) on delete cascade,
  role            text not null check (role in ('user', 'agent')),
  status          text not null default 'completed'
                    check (status in ('in_progress', 'completed', 'aborted', 'failed')),
  content_jsonb   jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  finalized_at    timestamptz
);

create index home_turns_session_idx on home_turns(session_id, created_at);
```

### RLS

Mirror of `home_sessions` — the gate is delegated through the parent session row using `is_member_of` + `auth.uid()`. No GUC-based scoping (per codex 2026-05-15 P1 #1).

```sql
alter table home_turns enable row level security;

-- A turn is reachable only through its parent session being owned by the caller.
create policy home_turns_via_session_read on home_turns
  for select using (
    session_id in (
      select id from home_sessions
       where public.is_member_of(tenant_id) and user_id = auth.uid()
    )
  );

create policy home_turns_via_session_insert on home_turns
  for insert with check (
    session_id in (
      select id from home_sessions
       where public.is_member_of(tenant_id) and user_id = auth.uid()
    )
  );

create policy home_turns_via_session_update on home_turns
  for update using (
    session_id in (
      select id from home_sessions
       where public.is_member_of(tenant_id) and user_id = auth.uid()
    )
  ) with check (
    session_id in (
      select id from home_sessions
       where public.is_member_of(tenant_id) and user_id = auth.uid()
    )
  );
```

**Plain English.** A turn is reachable only through its parent session — RLS delegates the gate. If the user cannot see the session, they cannot see, insert, or update the turn.

### Mutable vs append-only

- **Append-only on insert:** `id`, `session_id`, `role`, `created_at`.
- **Mutable (during streaming):** `content_jsonb` (appended to as SSE events fire), `status` (transitions `in_progress` → terminal), `finalized_at` (NULL → timestamp on terminal status).

After `status` reaches a terminal value (`completed`, `aborted`, `failed`), the row is **logically frozen** — no further mutations. v1.6 enforces this at the application layer (helpers in `src/lib/home/sessions.ts`); a database-level trigger to make it append-only-after-terminal can land later if needed.

### RPC ownership

- **Helpers in `src/lib/home/sessions.ts` perform all writes** via the authenticated user's `@supabase/ssr` server client. RLS gates correctness.
- **No SECURITY DEFINER function for home_turns** in v1.6. The streaming SSE Route Handler (`POST /api/home/turn`, M2.3) writes directly via these helpers; RLS scopes the writes to the caller's own sessions.

### Retention

- Follows the parent session. Archived session → turns remain queryable for 90 days, then a future cleanup hard-deletes alongside the session.
- **Streaming-orphan recovery.** Turns left `in_progress` past 5 minutes are considered orphaned (browser crashed, network died before `turn-end`). On next /home load, helpers downgrade them to `status='aborted'` via a conditional UPDATE — `update home_turns set status='aborted', finalized_at = now() where id = $1 and status = 'in_progress' and created_at < now() - interval '5 minutes'`. The `status = 'in_progress'` predicate is critical (per codex 2026-05-15 P2 #13): without it, a slow load racing with `turn-end` could overwrite a freshly completed turn back to aborted. v1.6 does this at the read path; no background job.

### Tenant-deletion cascade

Chain: `tenants → home_sessions → home_turns`. Deleting a tenant cascades through. Deleting just a `home_sessions` row cascades to its `home_turns`. No direct reference to `tenants(id)` on `home_turns` — the chain is enough.

### Observability

- **No operations_log entries for turn create/update.** Volume would dwarf all other entries; the trace IS the row.
- **operations_log entry on:**
  - Turn marked `failed` with non-trivial error (carries `payload={turn_id, error_class}`). The string `error_class` is the **canonical error category** (e.g., `quota_exhausted`, `llm_rate_limit`, `grounding_strip`) — never the raw exception message, since that may contain PII or user input.

### Test cases (M2 acceptance)

1. **RLS — cross-user turn invisible.** Insert turn into session A (user A); query as user B. Expect empty.
2. **Status lifecycle.** Insert with `in_progress`, update to `completed` — succeeds. Try to update from `completed` back to `in_progress` — helpers reject (verified in test, not DB-level constraint yet).
3. **Abort path.** SSE Route Handler with `req.signal.aborted` → finalize as `aborted` with `finalized_at` set.
4. **Orphan recovery.** Insert `in_progress` turn with `created_at = now() - interval '6 minutes'`; load /home; expect helper to downgrade to `aborted`.

---

## 3. `observer_signals`

**Purpose.** Per-tenant catalog of configured watches. Each row represents one signal (one PostHog metric in v1.6; later: one Linear board, one GitHub repo, etc.). Three-step consent flow: insert with `enabled=false` on step 2; update to `enabled=true` on step 3.

### Schema

```sql
create table observer_signals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  signal_type   text not null,
  config_jsonb  jsonb not null default '{}'::jsonb,
  enabled       boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  disabled_at   timestamptz,
  deleted_at    timestamptz
);

create index observer_signals_tenant_enabled_idx
  on observer_signals(tenant_id, enabled, deleted_at);
```

`signal_type` is the **capability-class implementation key** (e.g., `'posthog.metric'`). The schema does not enumerate accepted values — that's the adapter registry's job.

`config_jsonb` is the per-signal config (metric name, window_days, baseline_days, z_threshold, etc.). Adapter-specific shape; documented per adapter in `lib/integrations/<vendor>/adapter.ts`.

### RLS

```sql
alter table observer_signals enable row level security;

-- Read: tenant member.
create policy observer_signals_member_read on observer_signals
  for select using (public.is_member_of(tenant_id));

-- Write: operators+ only, via dedicated server actions
-- (apps/dashboard/src/app/settings/observers/actions.ts, M4.3).
-- Both USING and WITH CHECK supplied to be explicit (codex 2026-05-15 P2 #14).
create policy observer_signals_operator_write on observer_signals
  for all using (
    public.is_member_of(tenant_id) and public.is_operator_of(tenant_id)
  ) with check (
    public.is_member_of(tenant_id) and public.is_operator_of(tenant_id)
  );
```

**Plain English.** Every tenant member can SEE the catalog. Only operators+ can create, enable, disable, or soft-delete signals. The combination of RLS + server-action role checks makes the gate enforced at two layers.

### Mutable vs append-only

- **Append-only on insert:** `id`, `tenant_id`, `signal_type`, `created_at`, `created_by`.
- **Mutable:** `enabled` (false ↔ true, transitions logged), `config_jsonb` (operator-editable from /settings/observers; logged on change), `disabled_at` (set when `enabled` toggles false; cleared on re-enable), `deleted_at` (soft-delete; never unset).

Hard DELETE is not exposed to user code — soft-delete via `deleted_at` keeps observer_runs joinable for audit.

### RPC ownership

- **Creation** — server action `setupSignal()` from `/api/observer/signals/setup` (M4.4). Checks `is_operator_of()`, validates the signal via the adapter's first external call (e.g., PostHog metric existence + permissions), inserts with `enabled=false`. Three-step consent gate: no row exists before this call.
- **Enable / disable / soft-delete** — server actions `enableSignal()`, `disableSignal()`, `deleteSignal()` in `apps/dashboard/src/app/settings/observers/actions.ts` (M4.3). All check `is_operator_of()` + tenant ownership before issuing the update.
- **No SECURITY DEFINER RPC** — server actions run as authenticated user; RLS + server-side role checks are the gate.

### Retention

- **Soft-deleted rows (`deleted_at IS NOT NULL`):** retained 180 days for audit, then hard-deleted by a future cleanup. v1.6 just sets `deleted_at`.
- **Active rows:** retained as long as the tenant exists.

### Tenant-deletion cascade

`ON DELETE CASCADE` from `tenants(id)`. Deleting a tenant removes all signals; chained cascade removes all observer_runs (which references signal_id).

### Observability

Every state change on observer_signals appends to `operations_log`:

| Action | operations_log action | payload |
|---|---|---|
| Create (step 2 of consent) | `observer_signal_setup` | `{signal_id, signal_type, config_jsonb}` |
| Enable (step 3 of consent) | `observer_signal_enable` | `{signal_id}` |
| Disable (kill-switch) | `observer_signal_disable` | `{signal_id, reason}` |
| Config edit | `observer_signal_config_edit` | `{signal_id, diff}` |
| Soft-delete | `observer_signal_delete` | `{signal_id}` |

### Test cases (M3 / M4 acceptance)

1. **RLS — cross-tenant invisible.** Insert signal in tenant T1; switch to T2; expect 0 rows on read.
2. **RBAC — member cannot enable.** Authenticated as member-only user, attempt `update observer_signals set enabled = true`. Expect RLS rejection (since `is_operator_of()` fails).
3. **Consent — no row before step 2.** Calling `observer_propose` tool produces ONLY a preview action card; no observer_signals row exists. Verified by inspecting the table after the in-flight turn completes.
4. **Disable preserves history.** Disable signal S; verify `enabled=false`, `disabled_at` set; observer_runs for S still queryable (no ON DELETE behavior triggered).
5. **Tenant cascade.** Delete tenant; verify observer_signals + observer_runs gone.

---

## 4. `observer_runs`

**Purpose.** Per-execution audit trace of every observer run. Records inputs (window snapshot, signal config at run time), outputs (anomalies found, proposals filed), and the staged finding before queue acceptance. **Append-only after creation** (modulo the `proposals_filed` array which gets one append during the emit step).

### Schema

Single-write design (codex 2026-05-15 P1 #2 + P2 #12): the row is inserted **once at the end** of the observer run with a terminal `status`. No `in_progress` lifecycle state in v1.6, no append-only triggers, no post-insert UPDATE to `proposals_filed`. If a proposal was filed during the run, the proposal_id is included in the initial INSERT. This is mechanically simpler and avoids the `pg_trigger_depth() = 1` trap that would block SECURITY DEFINER updates.

```sql
create table observer_runs (
  id                  uuid primary key default gen_random_uuid(),
  signal_id           uuid not null references observer_signals(id) on delete cascade,
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  ran_at              timestamptz not null default now(),
  requested_by        uuid references auth.users(id) on delete set null,
  executed_by         text not null default 'user'
                        check (executed_by in ('user', 'cron')),
  window_start        timestamptz not null,
  window_end          timestamptz not null,
  window_snapshot     jsonb not null default '{}'::jsonb,
  anomalies_jsonb     jsonb not null default '[]'::jsonb,
  staged_finding      jsonb,
  proposals_filed     text[] not null default array[]::text[],
  llm_call_id         text,
  llm_tokens_used     integer,
  status              text not null
                        check (status in ('completed',
                                          'no_anomaly',
                                          'skipped_cooldown',
                                          'skipped_min_sample',
                                          'quota_exhausted',
                                          'adapter_error',
                                          'llm_error')),
  error_class         text,
  unique (signal_id, window_start)
);

create index observer_runs_signal_idx on observer_runs(signal_id, ran_at desc);
create index observer_runs_tenant_idx on observer_runs(tenant_id, ran_at desc);
```

`tenant_id` is denormalized onto the row (per migration 0021 pattern) so RLS lookups don't need to traverse `observer_signals`. The FK + the trigger that copies tenant_id at insert time (see RPC section below) keep the values consistent.

`requested_by` is nullable to support v1.7 cron (`requested_by IS NULL AND executed_by = 'cron'`). v1.6 inserts always carry the authenticated user's id.

`(signal_id, window_start)` is the **idempotency key** (codex 2026-05-15 #14 carryforward). Re-running with the same window cannot duplicate-emit; the unique constraint enforces this at the DB layer.

`status` has no default — the RPC always supplies a terminal value at insert time. There is no `in_progress` value because v1.6 inserts the row only once the run has produced its terminal classification.

### RLS

```sql
alter table observer_runs enable row level security;

-- Direct RLS read on tenant_id — cheaper than joining through observer_signals.
create policy observer_runs_member_read on observer_runs
  for select using (public.is_member_of(tenant_id));
```

After the table is created, revoke direct write grants from authenticated. All writes go through the SECURITY DEFINER `propose_observation()` RPC (M3, see RPC ownership below). The RPC validates the caller is the tenant's operator+ before inserting.

```sql
revoke insert, update, delete on observer_runs from authenticated;
```

**Plain English.** Any tenant member can READ the audit trail. No client can directly INSERT or UPDATE — the only path is `propose_observation()`, which does the full transaction (observer_run insert + queue insert) atomically.

### Mutable vs append-only

- **All fields are append-only at INSERT.** The row is fully populated in one statement at the end of the run; no field is mutated afterward.
- **No append-only trigger.** Earlier drafts of this doc described a `block_observer_run_mutation()` trigger mirroring `operations_log`. Codex 2026-05-15 P1 #2 correctly flagged that `pg_trigger_depth() = 1` is true even when a SECURITY DEFINER function issues the UPDATE — so the trigger would have blocked the very RPC paths it was meant to allow. The fix: don't use a trigger at all. Direct UPDATE/DELETE grants are revoked from `authenticated`; the only INSERT path is `propose_observation()` (SECURITY DEFINER); and no path UPDATEs after insert.

### RPC ownership

Two SECURITY DEFINER RPCs cover the M3 surface:

- `propose_observation(p_tenant_id uuid, p_signal_id uuid, p_window_start timestamptz, p_window_end timestamptz, p_window_snapshot jsonb, p_anomalies jsonb, p_staged_finding jsonb, p_llm_call_id text, p_llm_tokens_used int, p_status text, p_error_class text, p_proposal_body text, p_proposal_summary text) RETURNS jsonb` — atomic transaction:
  1. Verify `auth.uid() is not null` (any authenticated caller — role check below) AND `public.is_operator_of(p_tenant_id)`.
  2. Verify `p_signal_id` belongs to `p_tenant_id` and is `enabled = true` and not soft-deleted.
  3. If `p_staged_finding is not null` AND `p_status = 'completed'`: insert into `queue_items` using the same shape as `propose_change()` (proposal_id format `prop_<ts>_observer_<signal_slug>`), with frontmatter that includes the v1.6 observation fields (`type=observation`, `observer_run_id`, `signal_source`, `signal_id`, `anomaly_summary`, `baseline_window`, `citations`). Capture the proposal_id.
  4. Insert one row into `observer_runs` with `proposals_filed = case when proposal_id is not null then array[proposal_id] else array[]::text[] end`.
  5. Append `operations_log` (`action='observer_run'`).
  6. Return `{ok: true, observer_run_id, proposal_id (nullable)}`.
  - **Why one RPC, not two.** Codex 2026-05-15 P1 #6 flagged that the existing `propose_change()` has a fixed frontmatter shape and cannot carry `observer_run_id`. Rather than extend `propose_change()` (which is part of the queue contract and touched by file-mode parity in `scripts/propose.sh`), v1.6 ships a dedicated RPC that writes both rows in the same transaction. Body parsing is avoided.

- `accept_proposal_observation(p_proposal_id text) RETURNS jsonb` — M3.4. Atomic transaction:
  1. Verify `public.is_operator_of(...)` against the queue item's tenant.
  2. Verify the queue item exists, `status='pending'`, and the frontmatter `type = 'observation'`.
  3. Read `observer_run_id` from frontmatter; verify the matching `observer_runs` row exists and belongs to the same tenant.
  4. Create the `memory_files` row from `observer_runs.staged_finding`: `type = 'observation'` (requires the enum migration below), `status = 'active'` (the DB-level enum value — see top-of-doc clarification), tenant_id matched, frontmatter copied from `staged_finding`.
  5. Mark `queue_items.status = 'accepted'`; insert into `proposals_accepted`.
  6. Append `operations_log` (`action='accept_observation'`, payload includes both `proposal_id` and `observer_run_id`).
  7. Return `{ok: true, memory_file_id}`.

- **memory_type enum extension** (codex 2026-05-15 P1 #4) — migration 0047 MUST run `alter type public.memory_type add value if not exists 'observation';` before any `insert ... values ('observation'::memory_type)`. ALTER TYPE ADD VALUE is non-transactional in older Postgres but is fine on Supabase's current Postgres 15. Migration must commit this enum change before any RPC body that references it executes. If you bundle into one migration file, put the `alter type` at the top, separated by an explicit transaction boundary if your migration runner supports it; otherwise split into 0047a (enum) and 0047b (RPC).

- **Queue accept dispatch** (codex 2026-05-15 P1 #5) — the existing `accept_proposal()` only marks the queue item accepted + appends operations_log; it does not create memory rows. To avoid divergent code paths, M3.6's `/queue/[id]/page.tsx` server action inspects the queue item's frontmatter; if `type === 'observation'`, it calls `accept_proposal_observation()`; otherwise it falls through to the existing `accept_proposal()`. The dispatch lives in the route's server action, not in a SQL function (avoids touching the existing accept_proposal contract). Document this in M3.6's task description.

### Caller identity for v1.6

Codex 2026-05-15 P1 #7 flagged the "service actor" framing as ambiguous. v1.6 reality:

- `POST /api/observer/run-now/:signalId` is always invoked from a cookie-authenticated user session (`requireRole(actor, "operator")`). The Route Handler creates a Supabase server client bound to the user's session; `auth.uid()` returns the user inside both `propose_observation()` and `accept_proposal_observation()`. `requested_by = auth.uid()` and `executed_by = 'user'`.
- There is **no separate service-actor identity in v1.6.** The "service actor" framing only matters for v1.7's cron path, where `auth.uid()` will be null and the cron worker must pass `requested_by = null` + `executed_by = 'cron'` plus a service-role JWT that the RPC accepts.
- v1.6's RPC implementation MAY accept `requested_by` as a parameter (defaulting to `auth.uid()`) to make the v1.7 transition additive. Required behavior for v1.6: the RPC raises `unauthorized` if `auth.uid()` is null.

### Retention

- **365 days** by default. After 365 days, a cleanup job archives the row to cold storage (deferred to v1.7+). v1.6 just retains.
- Retention may be tightened per capability-class instance; default `posthog.metric` uses 365 days.

### Tenant-deletion cascade

Chain: `tenants → observer_signals → observer_runs`. Deleting a tenant cascades through. Deleting just a signal (hard delete, not soft) cascades to its runs — but v1.6 only soft-deletes signals, so runs remain.

### Observability

- **operations_log entry on every run completion** — action `observer_run`, payload `{run_id, signal_id, status, anomalies_count, proposals_filed_count}`. Triggered from inside `observer_run_record()` or its caller (M3 implementation chooses one).
- **No operations_log entry on `proposals_filed` array append** — the propose_change call itself logs to operations_log already.

### Test cases (M3 acceptance)

1. **Idempotency.** Insert two runs with same `(signal_id, window_start)`. Expect unique-violation error.
2. **RLS.** Cross-tenant query returns 0 rows.
3. **Append-only.** Try to UPDATE `status` from outside an RPC. Expect rejection from trigger.
4. **Proposals_filed mutation.** Call `observer_run_attach_proposal()`; verify array grows. Then attempt direct UPDATE on the column — expect rejection.
5. **Cascade.** Delete tenant; observer_runs gone.

---

## 5. `tenant_quotas`

**Purpose.** Per-tenant rolling daily usage counters. Used by `reserve_quota()` (atomic row lock + counter check) and `reconcile_quota()` (actual token reconciliation post-LLM-call). Concurrency-safe against parallel chat turns and observer runs.

### Schema

```sql
create table tenant_quotas (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,
  period_start     date not null default current_date,
  tokens_used      integer not null default 0,
  turns_count      integer not null default 0,
  runs_today       integer not null default 0,
  signals_active   integer not null default 0,
  updated_at       timestamptz not null default now()
);

-- Reservation table — short-lived rows that pre-reserve token budget.
create table tenant_quota_reservations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  actor_id         uuid references auth.users(id) on delete set null,
  kind             text not null check (kind in ('home_turn', 'observer_run')),
  estimated_tokens integer not null,
  reserved_at      timestamptz not null default now(),
  reconciled_at    timestamptz,
  actual_tokens    integer
);

create index tenant_quota_reservations_tenant_idx
  on tenant_quota_reservations(tenant_id, reconciled_at);
```

The reservation table is the **concurrency primitive** for codex #18's atomic-quota fix. `reserve_quota()` opens a transaction, takes `SELECT FOR UPDATE` on the `tenant_quotas` row, validates the budget, increments `tokens_used` by `estimated_tokens`, inserts the reservation row, commits. After the LLM call returns, `reconcile_quota(reservation_id, actual_tokens)` adjusts `tokens_used` by `(actual_tokens - estimated_tokens)` and marks the reservation reconciled.

**Row bootstrap (codex 2026-05-15 P2 #11).** `SELECT FOR UPDATE` requires a row to lock. Migration 0048 includes a one-time backfill for existing tenants (`insert into tenant_quotas (tenant_id) select id from tenants on conflict do nothing`) plus a trigger on `tenants` AFTER INSERT that seeds a new `tenant_quotas` row. `reserve_quota()` itself does NOT INSERT-ON-MISSING because doing so under contention without the seed trigger would race (two callers both INSERT, one wins, the other lock takes effect on a row that already incremented). Trigger-based bootstrap is the single source of truth.

**Stuck-reservation cleanup (codex 2026-05-15 P2 #9).** Reservations whose LLM call crashed mid-flight never get reconciled, and their `estimated_tokens` would otherwise stay subtracted from the budget forever (causing false `tokens_exceeded` after a few orphans accumulate). v1.6 ships **inline lazy cleanup** inside `reserve_quota()`: before computing the new budget, the RPC reconciles any reservations belonging to this tenant where `reconciled_at IS NULL AND reserved_at < now() - interval '5 minutes'` by treating `actual_tokens = estimated_tokens` (worst-case assumption — we keep the budget held), marking them reconciled, and proceeding. This makes orphans self-healing on the next reserve call. A future v1.7 background job will do better cleanup (e.g., refund unused budget after the timeout). v1.6 chooses the conservative path because it cannot prove the LLM call didn't actually complete.

### RLS

```sql
alter table tenant_quotas enable row level security;
alter table tenant_quota_reservations enable row level security;

-- Read: any tenant member sees the tenant's counter. /settings/usage uses this.
create policy tenant_quotas_member_read on tenant_quotas
  for select using (public.is_member_of(tenant_id));

create policy tenant_quota_reservations_member_read on tenant_quota_reservations
  for select using (public.is_member_of(tenant_id));

-- Writes ONLY via reserve_quota() / reconcile_quota() RPCs (SECURITY DEFINER).
-- Revoke direct writes from authenticated below.
```

```sql
revoke insert, update, delete on tenant_quotas from authenticated;
revoke insert, update, delete on tenant_quota_reservations from authenticated;
```

**Plain English.** Every tenant member can read the tenant's daily counter and reservation log. Only the SECURITY DEFINER RPCs can mutate. No direct UPDATE from the application is allowed; the only path is through the RPC, which holds the row lock.

### Mutable vs append-only

- **tenant_quotas:** Mutable (`tokens_used`, `turns_count`, `runs_today`, `signals_active`, `updated_at`). Reset by daily cron when `period_start < current_date`. v1.6 does the reset lazily inside `reserve_quota()` — first call of a new day rolls the period forward.
- **tenant_quota_reservations:** Append-only on insert; `reconciled_at` + `actual_tokens` mutable once (NULL → terminal). Frozen after reconciliation.

### RPC ownership

Both RPCs are SECURITY DEFINER and the **only** code paths that touch these tables.

- `reserve_quota(p_tenant_id uuid, p_actor_id uuid, p_estimated_tokens int, p_kind text) RETURNS jsonb`
  - Returns `{ok: true, reservation_id: uuid}` on success or `{ok: false, reason: 'tokens_exceeded' | 'turns_exceeded' | 'runs_exceeded' | 'signals_exceeded'}` on failure.
  - Implementation uses `SELECT ... FOR UPDATE` on `tenant_quotas` to serialize concurrent callers per tenant.

- `reconcile_quota(p_reservation_id uuid, p_actual_tokens int) RETURNS jsonb`
  - Adjusts `tenant_quotas.tokens_used` by the delta. Idempotent on `reservation_id` (re-call is a no-op).

Per ADR-0012 / migration 0039, callers may be any authenticated role (the gate is at the route handler, not the RPC). v1.6 callers: `homeTurn` (cookie-auth user) and `observerRun` (service actor — but currently always invoked from a cookie-auth user-driven endpoint).

**Per-user hourly cap is deferred (codex 2026-05-15 P2 #10).** The design doc mentions `max_turns_per_user_per_hour` as a hard cap, but `tenant_quotas` is keyed by `tenant_id` only — no per-`(tenant_id, actor_id, hour_bucket)` counter exists. Adding that schema in v1.6 isn't necessary because the demo scenarios are single-user-per-tenant. v1.6 ships with `turns_count` tracked at tenant scope only; the per-user-per-hour cap is **dropped from v1.6** and revisited in v1.7 along with cron + multi-user scenarios. Track this as an explicit v1.7 follow-up below.

### Retention

- **tenant_quotas:** persistent (one row per tenant; values reset daily by `reserve_quota`).
- **tenant_quota_reservations:** retained 30 days for audit, then a future cleanup hard-deletes.

### Tenant-deletion cascade

`ON DELETE CASCADE` from `tenants(id)`. Deleting a tenant removes the quota row and all reservations.

### Observability

- **No operations_log entry on every reserve/reconcile** — volume would be too high.
- **operations_log entry on quota exhaustion** — action `quota_exhausted`, payload `{reason, kind, period_start}`. One entry per "first exhausted call in a 24h window per tenant" — debounced. v1.6 ships a simple emit-once-per-day flag inside the RPC.

### Test cases (M4 acceptance — the critical one)

1. **Concurrency.** Run 100 parallel `reserve_quota` calls against a budget of 10 (each requesting 1). Expect exactly 10 succeed, 90 return `tokens_exceeded`. No overspend (`tokens_used <= max_tokens_per_day` after all complete).
2. **Reconciliation.** Reserve 500 tokens, reconcile with 420 actual — verify `tokens_used` reduced by 80.
3. **Daily reset.** Insert quota with `period_start = current_date - 1`; call `reserve_quota`; verify counter reset to 0 + new period_start = current_date.
4. **RLS read.** Member of T1 can SELECT T1's quota; member of T2 cannot.
5. **Direct write blocked.** As authenticated user, attempt `update tenant_quotas set tokens_used = 0`. Expect permission denied.

---

## Cross-table invariants

These invariants tie the five tables together and must hold across all v1.6 migrations:

1. **Every observer run links to a signal.** `observer_runs.signal_id` is `not null`; FK enforces.
2. **Every observation proposal carries `observer_run_id` in frontmatter.** Enforced by `ProposalEmitter` (M1.9) and verified at `accept_proposal_observation()` time (M3.4) before the memory_files row is created.
3. **Quota deltas always equal LLM call sums.** Each completed LLM call must have a paired `reconcile_quota` invocation. v1.6 enforces this in code (try/finally inside `homeTurn` and `observerRun`); a future audit job will reconcile across `tenant_quota_reservations` looking for unreconciled rows older than 5 minutes.
4. **operations_log version `v` is monotonic per tenant** — already enforced by migration 0007's pattern; v1.6 adds new `action` values but reuses the version primitive.
5. **No memory_files row references an observer_run that doesn't exist.** Enforced by `accept_proposal_observation()` checking the staged finding exists before creating the memory_files row.

## Open questions deferred past v1.6

- **Hard-delete cleanup jobs.** v1.6 sets `archived_at` / `deleted_at` but never hard-deletes. v1.7 needs cleanup workers + a written policy on legal-hold cases.
- **Cross-tenant admin visibility.** A future capability for hosted-demo support staff to read across tenants for debugging. v1.6 RLS is strict per-tenant; relaxing requires a new ADR.
- **Per-tenant quota override UI.** v1.6 hardcodes defaults from a config file (M4.1). A future /settings/usage page exposes override knobs to admins.
- **Quota reservation refunds.** v1.6 ships **conservative inline cleanup** (orphans get `actual = estimated`, see Quota section). v1.7 will refine: background worker that distinguishes "LLM call definitively didn't complete" from "orchestrator crashed after a successful call," and refunds budget appropriately.
- **Per-user hourly cap.** Dropped from v1.6 (see Quota section). v1.7 adds `(tenant_id, actor_id, hour_bucket)` counter table or equivalent, alongside multi-user scenarios + cron quota gating.
