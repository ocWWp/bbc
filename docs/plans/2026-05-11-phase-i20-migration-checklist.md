# Phase I.20 — Migration verification checklist

**Status:** Migrations 0020-0022 committed but **NOT YET APPLIED** to any database. No local Postgres / Docker / Supabase CLI was available during execution. Zeth (or whoever has staging DB access) must run through this checklist before merging `phase-i20-ingestion` to `main`.

**Files to verify:**
- `apps/dashboard/supabase/migrations/0020_ingestion_sources.sql`
- `apps/dashboard/supabase/migrations/0021_memory_file_sources.sql`
- `apps/dashboard/supabase/migrations/0022_memory_type_source_artifact_note.sql`

## How to verify

```bash
# From repo root, against a fresh staging or local Supabase:
cd apps/dashboard
supabase db reset    # applies all migrations 0001..0022 in order
# OR: supabase db push  # if iterating against existing
```

If `supabase db reset` runs cleanly, the structural checks below are largely answered. Then walk through the runtime checks.

## Structural checks (caught by `db reset`)

- [ ] `ingestion_source_kind` enum created with values `('text', 'url', 'file')`.
- [ ] `ingestion_status` enum created with all 6 values.
- [ ] `ingestion_sources` table exists, with `tenant_id` + `created_by` FKs, `(tenant_id, idempotency_key)` unique constraint, `ingestion_sources_tenant_created_idx` index.
- [ ] `memory_file_sources` table exists, with cascading FKs to `memory_files`, `ingestion_sources`, and `tenants`.
- [ ] 3 RLS policies on `ingestion_sources` (read/insert/update), 2 on `memory_file_sources` (read/insert).
- [ ] `memory_type` enum now includes `source_artifact` and `note` (`select enum_range(null::memory_type);`).

## Runtime / behavioral checks (manual)

- [ ] **Enum-add-in-transaction**: Migration 0022 uses `alter type add value if not exists`. PG12+ allows this in a transaction; Supabase is PG15 so it should pass — but worth confirming the migration didn't get rolled back or split unexpectedly.
- [ ] **Idempotency-key uniqueness**: insert two rows with the same `(tenant_id, idempotency_key)` and confirm the second is rejected.
- [ ] **Member can read own tenant's sources, cannot read other tenant's**: insert as tenant A, query as tenant B → empty result.
- [ ] **`created_by = auth.uid()` enforced on insert**: try inserting with `created_by` set to someone else's user id → should fail with RLS check violation.
- [ ] **Cascade-delete from `ingestion_sources` → `memory_file_sources`**: delete a source row, verify orphan join rows are removed.
- [ ] **Cascade-delete from `memory_files` → `memory_file_sources`**: delete a memory, verify join rows removed.

## Known deviations from plan

1. **Migration numbering shifted**: plan said 0020/0021/0023; existing migrations stopped at 0019, so used 0020/0021/0022 (no gap).
2. **Backfill migration dropped**: plan's `0023_backfill_text_sources.sql` referenced `memory_files.created_by` which doesn't exist. Old memories (pre-I.20) will not have `memory_file_sources` rows. UI must handle "no source" gracefully on review/done steps.
3. **Added migration 0022** (`memory_type` enum extension) which the plan implicitly required but didn't include — TS-only adds for `source_artifact` + `note` would have failed at insert time without the enum extension.

## If anything fails

- **Enum extension fails in transaction**: split 0022 into a standalone migration with explicit `commit;` between values. Test locally first.
- **RLS policies block expected reads**: verify `public.is_member_of(tenant_id)` returns true for the test user — check `tenant_members` has a row for them.
- **FK violation on insert**: confirm the tenant + user actually exist before inserting an `ingestion_sources` row. Server action in `actions.ts` will do this via `requireActor()`.

## After verification

Remove this file. The migration history is the audit trail; this checklist is scaffolding.
