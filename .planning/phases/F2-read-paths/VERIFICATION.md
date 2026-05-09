---
phase: F2-read-paths
verified: 2026-05-09T00:00:00Z
status: gaps_found
score: 11/13 must-haves verified
gaps:
  - truth: "DB-mode read path is exercised end-to-end (BBC_MODE=db actually returns data)"
    status: uncertain
    reason: "SupabaseStore implementations type-check, build, and pass static analysis, but Phase 2's smoke tests all ran in file-mode (`BBC_MODE` unset → default 'file'). Live probes against the dev server (`/auth/signin`=200, `/`=307, `/queue`=307, `/log`=307, `/bindings`=307) are consistent with file-mode + auth redirect. There is no evidence in this session that any SupabaseStore method was ever called against the live tables. The flag exists, the code path exists, the tables exist — but the wire was never tugged. Worse: the bulk backfill that would put rows in those tables is explicitly deferred to Phase 7's `bbc-cli import`, so even if a verifier flips `BBC_MODE=db` today, every read returns an empty result and that empty result is indistinguishable from a broken query. This is a deferred-by-design risk; flagging it as uncertain rather than failed because the plan explicitly scoped the deferral."
    artifacts:
      - path: "packages/store/src/supabase/queue.ts"
        issue: "RLS-aware reads (no explicit tenant_id filter; relies on auth_tenant() in policy). Correct by construction, but never exercised in this session against a real authenticated client."
      - path: "packages/store/src/supabase/log.ts"
        issue: "lkg() is implemented as 'select v from operations_log order by v desc limit 1' rather than reading a dedicated lkg pointer. That diverges from file-mode (where lkg.txt is a separate writer-emitted pointer). For pure-read it's fine; once Phase 3 introduces concurrent emitters, the two definitions of LKG can drift."
      - path: "packages/store/src/supabase/bindings.ts"
        issue: "Returns empty array if no rows; UI cannot distinguish 'tenant has no bindings yet' from 'query failed silently' because errors throw but empty success is the same shape as a non-existent tenant. Acceptable for read-only Phase 2; flag for Phase 7 backfill design."
    missing:
      - "Phase 7 (`bbc-cli import`) must seed at least the queue/log/bindings rows for the bootstrap `zeths-bbc` tenant, then re-verify with `BBC_MODE=db` against the live dev server. The verification step is: set BBC_MODE=db in apps/dashboard/.env.local, restart dev server, sign in, hit /queue + /log + /bindings, confirm rows render."
      - "Add a dedicated runtime smoke test (script under apps/dashboard/scripts/ or packages/store/scripts/) that runs both LocalStore and SupabaseStore against a known fixture tenant and diffs the outputs — this is the parity-tax check that Phase 0's deployment-modes.md §Mode-selection promised."

  - truth: "Frontmatter parsing is single-source"
    status: failed
    reason: "Two near-identical copies of the YAML-frontmatter parser now live in the tree: `packages/store/src/local/frontmatter.ts` (95 lines, used by LocalQueueStore) and `apps/dashboard/src/lib/frontmatter.ts` (still imported by read-skills.ts, read-leaf-resources.ts, read-commands.ts — three filesystem-direct readers that Phase 2 did NOT consolidate into the store). The new copy explicitly says 'Lifted from apps/dashboard/src/lib/frontmatter.ts so LocalStore can parse without a dependency back into the dashboard.' That's a defensible isolation boundary, but it is also exactly the duplication Main's principle 1 ('Memory is the contract') warns against: now there are two parsers that can drift, and the only thing keeping them in sync is human discipline. ADR-0004's per-construct ruling table did not anticipate this kind of in-process duplication, so it isn't strictly forbidden — but it sets up a future fork."
    artifacts:
      - path: "packages/store/src/local/frontmatter.ts"
        issue: "Duplicates apps/dashboard/src/lib/frontmatter.ts. Comment acknowledges the duplication."
      - path: "apps/dashboard/src/lib/frontmatter.ts"
        issue: "Still imported by read-skills.ts (line 4), read-leaf-resources.ts (line 4). read-commands.ts has its own inline regex parser. Three different parsers in one app-tree."
    missing:
      - "Either: hoist the shared parser into a new `packages/utils/` workspace consumed by both, OR scope the duplication explicitly (e.g., comment in both copies pointing at the other and a CI check that diffs them). The cheap fix is the second; the durable fix is the first."
      - "When read-skills/read-leaf-resources/read-commands move into @bbc/store (deferred per Phase 2 scope), retire apps/dashboard/src/lib/frontmatter.ts and have all consumers import from @bbc/store."

human_verification:
  - test: "Live DB schema probe via mcp__supabase tools (project gpmtkhyczbapnfquhswn)"
    expected: |
      \dt public.* shows: tenants, tenant_members, tenant_invitations, profiles, memory_files, queue_items, operations_log, bindings, proposals_accepted, proposals_rejected (and only these in the migration set).
      \d public.queue_items shows the queue_status enum constraint, manager_review/cross_leaf_impact/promotion_check jsonb columns, and the unique(tenant_id,proposal_id) index.
      \d public.operations_log shows bigserial id, the unique(tenant_id,v) index, and recent_idx on (tenant_id,ts desc).
      select tgname, tgtype from pg_trigger where tgrelid in ('public.queue_items'::regclass, 'public.operations_log'::regclass, 'public.proposals_accepted'::regclass, 'public.proposals_rejected'::regclass) returns:
        - queue_items_no_delete (BEFORE DELETE)
        - operations_log_no_update (BEFORE UPDATE)
        - operations_log_no_delete (BEFORE DELETE)
        - proposals_accepted_no_update / no_delete (BEFORE)
        - proposals_rejected_no_update / no_delete (BEFORE)
      All three trigger functions (block_top_level_queue_delete, block_top_level_log_mutation, block_top_level_audit_mutation) are SECURITY DEFINER, set search_path = public, and have EXECUTE revoked from public/anon/authenticated.
    why_human: "This verifier session does not have mcp__supabase tools exposed. The migration files on disk show every claim is correct in source — but the canonical fact (live DB state) can only be confirmed by direct SQL probe."
  - test: "Cascade-delete behavior across the block_top_level_* triggers"
    expected: |
      Delete a tenants row. The FK 'on delete cascade' on memory_files / queue_items / operations_log / bindings / proposals_accepted / proposals_rejected fires. Inside that cascade, pg_trigger_depth() > 1, so the block_top_level_* triggers return OLD without raising. Result: tenant row deletes; child rows delete too. The triggers ONLY block direct/top-level user DELETEs (and, for the audit + log tables, top-level UPDATEs).
    why_human: "Static analysis cannot prove pg_trigger_depth() returns the expected value during a cascade. The pattern is standard and ADR-blessed, but a live `delete from public.tenants where slug = '<test-tenant>'` (against a disposable fixture) is the only definitive check. Recommend running this once during Phase 7 import-cli development."
  - test: "BBC_MODE=db against the live dev server with a seeded tenant"
    expected: "After Phase 7's bbc-cli import seeds zeths-bbc's queue + log + bindings into Postgres, setting BBC_MODE=db and signing in renders the same data on /queue, /log, /bindings as BBC_MODE=file. Numerical sanity: row counts match, ordering matches, frontmatter fields render identically."
    why_human: "Requires Phase 7's import to land first; deferred-by-design from Phase 2."
---

# Phase F2: BBC State to DB — Read Paths — Verification Report

**Phase Goal (per plan):** New tables (memory_files, queue_items, operations_log, bindings, proposals_accepted, proposals_rejected) all tenant_id'd. Define MemoryStore/QueueStore/LogStore interfaces. SupabaseStore impl. Rewrite all dashboard `src/lib/read-*.ts` from `fs.readFile` to store calls. Self-host LocalStore impl (Phase 7).

**Plan reference:** `/Users/grid/.claude/plans/i-need-you-to-merry-teacup.md` § "Phase 2 — BBC state to DB: read paths"

**Scoping clarification (from author of the phase):** Deliverable is interface + both impls + file-mode default. Bulk backfill (filesystem → DB rows) is deferred to a Phase 7 `bbc-cli import` command. MemoryStore is deferred until a page consumes memory rows. Write paths (`acceptProposal()` / `rejectProposal()` / `proposeChange()`) are Phase 3.

**Verified:** 2026-05-09
**Status:** gaps_found (11/13 verified, 1 failed: frontmatter duplication; 1 uncertain: DB-mode never exercised end-to-end)
**Re-verification:** No — initial verification.

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                              | Status     | Evidence                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The six new DB tables exist in source migrations with the right shape, RLS, and constraints       | VERIFIED   | Migrations 0005, 0006, 0007 on disk match every schema claim line-by-line (see Required Artifacts).                                                                                                                                                                                                |
| 2   | Append-only invariants are enforced via SECURITY DEFINER triggers that admit cascade deletes      | INFERRED   | Trigger functions all use `pg_trigger_depth() = 1` to permit cascade from `tenants` ON DELETE CASCADE. Functions are `security definer`, `set search_path = public`, and `revoke execute ... from public, anon, authenticated`. Live probe deferred to human verification.                          |
| 3   | RLS is enabled and member-scoped on all six tables                                                 | INFERRED   | All migrations call `enable row level security` then declare a `_member_read` policy keyed on `public.is_member_of(tenant_id)` (the helper from migration 0003, declared SECURITY DEFINER to break recursion). Live probe deferred.                                                                |
| 4   | `@bbc/store` workspace package is wired correctly (name, AGPL, type=module, three exports)        | VERIFIED   | `packages/store/package.json` declares `name: "@bbc/store"`, `license: "AGPL-3.0"`, `type: "module"`, `private: true`, exports `.` `./local` `./supabase`. `dependencies` has `@supabase/supabase-js ^2.45.0`. Workspace store is installed via `apps/dashboard/package.json` `"@bbc/store": "workspace:*"`.            |
| 5   | Storage interfaces are defined with the right contracts                                            | VERIFIED   | `packages/store/src/interfaces.ts` defines `Proposal`, `ProposalStatus` (`pending|accepted|rejected`), `LogEntry`, `Binding`, plus `QueueStore` (list/listAll/getById), `LogStore` (list/lkg), `BindingsStore` (list), and aggregate `Store`. `MemoryStore` is intentionally absent (deferred). |
| 6   | LocalStore is implemented and reads via Node fs                                                    | VERIFIED   | `packages/store/src/local/{index,queue,log,bindings,frontmatter}.ts` all present. `LocalStore` constructor takes `bbcRoot`, instantiates three sub-stores. `LocalQueueStore` reads `queue/`, `queue/_accepted/`, `queue/_rejected/` markdown. `LocalLogStore` reads `_log/operations.jsonl`. `LocalBindingsStore` parses `memory/ops/bindings.yaml` 5-cell rows. |
| 7   | SupabaseStore is implemented and queries the right tables/columns                                  | VERIFIED   | `packages/store/src/supabase/{index,queue,log,bindings}.ts` all present. Each sub-store takes a `SupabaseClient`, uses RLS-implicit tenant scoping (no explicit tenant_id .eq filter — correct: `auth_tenant()` in policy does it). Queue selects the documented column set; log selects v/ts/actor/action/target/state_hash/lkg_at_emit/payload; bindings selects role/provider_id/provisional/bound_at/notes ordered by role. |
| 8   | Imports use bare relative module specifiers (no `.js` extensions)                                  | VERIFIED   | `grep -n 'from "./'` across all package source: every relative import uses bare paths (`"./queue"`, `"./local/index"`, etc.). No `.js` suffixes. Turbopack source mode resolves cleanly.                                                                                                              |
| 9   | Dashboard depends on `@bbc/store` and exposes `getStore()`                                         | VERIFIED   | `apps/dashboard/package.json` line 14: `"@bbc/store": "workspace:*"`. `apps/dashboard/src/lib/store.ts` exports async `getStore()` that reads `process.env.BBC_MODE` (default `"file"`), constructs `SupabaseStore` for `db` and `LocalStore` for everything else.                                       |
| 10  | The three read-*.ts shims preserve the historical export shape                                     | VERIFIED   | `read-queue.ts` exports `Proposal`, `ProposalStatus`, `listPending`, `listAccepted`, `listRejected`, `findById`, `isApproved`, `readQueueAll`. `read-log.ts` exports `LogEntry`, `readLog`, `readLkg`, `recentLog`, `countSince`. `read-bindings.ts` exports `Binding`, `readBindings`. All match the Phase 1 baseline.                       |
| 11  | Pages import unchanged (`@/lib/read-*`)                                                            | VERIFIED   | `grep` across `apps/dashboard/src/app/`: `page.tsx` imports `listPending` + log helpers; `queue/page.tsx` imports `listPending,listAccepted,listRejected,isApproved`; `queue/[id]/page.tsx` imports `findById,isApproved`; `log/page.tsx` imports `readLog,readLkg`; `bindings/page.tsx` imports `readBindings`. No page imports from `@bbc/store` directly. |
| 12  | Build, type-check, dev server all green                                                            | VERIFIED   | `pnpm --filter @bbc/dashboard type-check` exits 0 with no output (silent success). `pnpm --filter @bbc/dashboard build` reports "Compiled successfully" and emits all 11 routes (`/`, `/_not-found`, `/auth/{callback,signin,signout}`, `/bindings`, `/graph`, `/log`, `/queue`, `/queue/[id]`, `/skills`). Live probes: `/auth/signin`=200, `/`=307, `/queue`=307, `/log`=307, `/bindings`=307. |
| 13  | The bbc:dashboard skill uses the pnpm-10-safe filter command                                       | VERIFIED   | `bbc/.claude/commands/bbc/dashboard.md` lines 39-41 spec `pnpm --filter @bbc/dashboard dev` and explicitly call out the recursive-mode pitfall: "bare `pnpm dev` from the bbc/ root triggers pnpm's recursive mode and fails because not all workspace packages have a `dev` script. Always use `--filter`." |

**Score:** 11/13 fully verified (truths 1, 4–13). Truths 2 and 3 INFERRED from migrations + types (live SQL probe deferred to human verification — this verifier session does not have mcp__supabase tools, despite the prompt's expectation).

### Required Artifacts

| Artifact                                                                                | Expected                                                  | Status   | Details                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/dashboard/supabase/migrations/0005_memory_files.sql`                              | memory_files table, FK cascade, RLS, indexes              | VERIFIED | 27 lines. id uuid pk, tenant_id FK on delete cascade, path text, content text, frontmatter jsonb default '{}', timestamps, unique(tenant_id, path). RLS enabled. `memory_files_member_read` policy via `is_member_of(tenant_id)`. Two indexes (tenant_idx, path_idx).               |
| `apps/dashboard/supabase/migrations/0006_queue_items.sql`                               | queue_items + queue_status enum + DELETE-blocking trigger | VERIFIED | 52 lines. `queue_status` enum (pending/accepted/rejected). Table has manager_review/cross_leaf_impact/promotion_check as jsonb (matches ADR-0002 review annotation pattern). unique(tenant_id, proposal_id). DELETE blocked at top level via `block_top_level_queue_delete()` trigger. `queue_items_member_read` policy. |
| `apps/dashboard/supabase/migrations/0007_operations_log_bindings_proposals_audit.sql`   | log + bindings + proposals_accepted/rejected              | VERIFIED | 121 lines. operations_log: bigserial id, unique(tenant_id,v), recent_idx on (tenant_id,ts desc), UPDATE+DELETE blocked via `block_top_level_log_mutation`. bindings: ((tenant_id,role) PK), provider_id, provisional, bound_at, notes. proposals_accepted/rejected: ((tenant_id,proposal_id) PK), UPDATE+DELETE blocked via `block_top_level_audit_mutation`. All RLS enabled with `_member_read` policies. |
| `packages/store/package.json`                                                           | @bbc/store, AGPL, ESM, 3 exports                          | VERIFIED | All claims verified above. supabase-js 2.45 dep present.                                                                                                                                                                                                                              |
| `packages/store/src/interfaces.ts`                                                      | Proposal/ProposalStatus/LogEntry/Binding + 4 stores       | VERIFIED | All types and interfaces present. `MemoryStore` intentionally absent.                                                                                                                                                                                                                  |
| `packages/store/src/local/{index,queue,log,bindings,frontmatter}.ts`                    | LocalStore + 3 sub-stores + parser                        | VERIFIED | All five files present. Frontmatter parser is duplicated from dashboard (see Gap 2).                                                                                                                                                                                                |
| `packages/store/src/supabase/{index,queue,log,bindings}.ts`                             | SupabaseStore + 3 sub-stores                              | VERIFIED | All four files present. RLS-aware (no explicit tenant_id filter on reads).                                                                                                                                                                                                            |
| `packages/store/tsconfig.json`                                                          | TypeScript config                                         | VERIFIED | File exists; type-check passes from monorepo root.                                                                                                                                                                                                                                    |
| `apps/dashboard/src/lib/store.ts`                                                       | getStore() factory reading BBC_MODE                       | VERIFIED | 23 lines. `"server-only"` guard, BBC_MODE switch, both store constructors invoked correctly. Default = file.                                                                                                                                                                        |
| `apps/dashboard/src/lib/read-{queue,log,bindings}.ts`                                   | Thin shims, historical exports preserved                  | VERIFIED | All three files now ≤ 50 lines, no `fs.readFile` calls (verified via grep), all exports route through `getStore()`.                                                                                                                                                                  |
| `apps/dashboard/package.json` `@bbc/store` dep                                          | workspace:* dep                                           | VERIFIED | Line 14.                                                                                                                                                                                                                                                                              |
| `bbc/.claude/commands/bbc/dashboard.md`                                                 | Uses `pnpm --filter @bbc/dashboard dev`                   | VERIFIED | Line 40, with explanatory comment about pnpm 10 recursive-mode failure.                                                                                                                                                                                                              |

### Key Link Verification

| From                                       | To                                | Via                                                | Status     | Details                                                                                                              |
| ------------------------------------------ | --------------------------------- | -------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/dashboard/src/lib/store.ts`          | `@bbc/store` LocalStore + SupabaseStore | `import { LocalStore, SupabaseStore } from "@bbc/store"` | WIRED      | Both classes constructed in branches of the BBC_MODE switch; constructor args correct (bbcRepoRoot() / supabase server client). |
| read-queue.ts                              | `@bbc/store` Proposal/ProposalStatus | type re-export + getStore().queue                  | WIRED      | All six exported functions delegate to store.queue. No fs imports remain.                                            |
| read-log.ts                                | `@bbc/store` LogEntry             | type re-export + getStore().log                    | WIRED      | Both `readLog` and `readLkg` route through store. `recentLog` and `countSince` are pure functions over LogEntry[].   |
| read-bindings.ts                           | `@bbc/store` Binding              | type re-export + getStore().bindings.list()         | WIRED      | Single delegation function.                                                                                          |
| Page (`app/queue/page.tsx`)                | read-queue shim                   | `import { listPending, ... } from "@/lib/read-queue"` | WIRED      | Import path unchanged from Phase 1.                                                                                  |
| Page (`app/log/page.tsx`)                  | read-log shim                     | `import { readLog, readLkg } from "@/lib/read-log"`  | WIRED      | Import path unchanged.                                                                                                |
| Page (`app/bindings/page.tsx`)             | read-bindings shim                | `import { readBindings } from "@/lib/read-bindings"` | WIRED      | Import path unchanged.                                                                                                |
| LocalQueueStore                            | `bbcRoot/queue/{,_accepted,_rejected}` markdown | `fs.readdir` + `fs.readFile`             | WIRED      | Same paths the legacy dashboard read; preserves file-mode parity.                                                    |
| LocalLogStore                              | `bbcRoot/_log/operations.jsonl` + `lkg.txt` | `fs.readFile`                                    | WIRED      | Same paths; jsonl line parsing tolerant of malformed lines.                                                          |
| LocalBindingsStore                         | `bbcRoot/memory/ops/bindings.yaml` 5-cell row table | regex parser                                       | WIRED      | Matches the format `bindings.yaml` actually uses.                                                                     |
| SupabaseStore sub-stores                   | RLS-scoped tables                 | `auth_tenant()` policy + `is_member_of()` helper   | INFERRED   | No explicit tenant filter on reads — relies on the policies declared in 0005/0006/0007. Live probe deferred.        |
| `block_top_level_queue_delete` trigger     | `pg_trigger_depth()` semantics     | trigger fires BEFORE DELETE                        | INFERRED   | Standard pattern; depth=1 means top-level user delete. Cascade from tenants increments depth → trigger admits.       |
| `block_top_level_log_mutation` trigger     | UPDATE + DELETE on operations_log | same pattern                                       | INFERRED   | Two BEFORE triggers (UPDATE, DELETE) both call the same function; function inspects tg_op to return new vs old.    |
| `block_top_level_audit_mutation` trigger   | UPDATE + DELETE on proposals_accepted + proposals_rejected | same pattern, parameterized by tg_table_name in error message | INFERRED   | Four BEFORE triggers (UPDATE/DELETE × 2 tables) all share one function. Error message correctly says `'<table> audit rows are immutable'`. |

### Anti-Patterns Found

| File                                         | Line(s) | Pattern                                                                | Severity   | Impact                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ------- | ---------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/store/src/local/frontmatter.ts`    | (whole) | Duplicated from `apps/dashboard/src/lib/frontmatter.ts`                | ⚠️ Warning | Two parsers. Comment in the new copy acknowledges; durable fix is to hoist into a shared `packages/utils/`. See Gap 2.                                                                                                                                          |
| `packages/store/src/supabase/log.ts`         | 42-51   | `lkg()` defined as max(v) rather than reading a writer-emitted pointer  | ℹ️ Info    | Phase-2 read-only is fine. Once Phase 3 introduces concurrent emitters, the max-v definition can disagree with a separate lkg pointer if one is added later. Worth flagging in the Phase 3 plan.                                                              |
| (NOT FOUND) TODO/FIXME/PLACEHOLDER in Phase 2 source | —       | scaffolding markers                                                    | —          | grep across `packages/store/src/` and the three read-*.ts shims and migrations 0005/0006/0007: zero TODO/FIXME/XXX/HACK/PLACEHOLDER hits. No `return null` placeholders. No empty handlers.                                                                  |

### Out-of-scope confirmations (not flagged as gaps)

- **MemoryStore is absent.** Plan body says "MemoryStore" but author scoped it as deferred until a page consumes memory rows. No page does today. Not flagged.
- **Memory bulk backfill is absent.** Phase 7's `bbc-cli import` will seed historical filesystem state into Postgres. Not flagged; flagged for Phase 7.
- **Write paths are absent.** Phase 3's `acceptProposal()` / `rejectProposal()` / `proposeChange()` SQL transactions. Not flagged.
- **`apps/dashboard/src/app/queue/actions.ts` still calls `bash accept.sh`/`reject.sh` (or whatever Phase 1 wired).** That's Phase 3 work.
- **`read-skills.ts`, `read-leaf-resources.ts`, `read-commands.ts` still read filesystem directly.** All three import the dashboard's own `frontmatter.ts` and call `fs.readdir` / `fs.readFile`. The plan author scoped Phase 2 to queue/log/bindings only — these three modules cover skill/leaf/command discovery, which has no DB-mode equivalent yet (it's a filesystem-affordance concern, similar to `_index.md` regeneration). Treating as deferred-by-design, not as missing.
- **MCP-tool-based DB-schema probe.** The prompt asked the verifier to use `mcp__supabase__list_tables` / `execute_sql` against project `gpmtkhyczbapnfquhswn`. Those tools are not exposed to this verifier session; live probes are queued in `human_verification` rather than run.

### Human Verification Required

See `human_verification:` block in frontmatter. Three items:

1. **Live DB schema probe** — confirm 0005/0006/0007 are applied to `gpmtkhyczbapnfquhswn` and the trigger functions have the documented security/search_path/EXECUTE-revoke posture. Source-of-truth check that source migrations on disk match the live DB.

2. **Cascade-delete behavior probe** — delete a disposable test tenant; verify the FK cascade fires through to memory_files / queue_items / operations_log / bindings / proposals_accepted/rejected without the `block_top_level_*` triggers raising. This is the round-1 worry the prompt explicitly called out: does `pg_trigger_depth() = 1` actually pass cascade deletes?

3. **BBC_MODE=db end-to-end probe** — deferred until Phase 7's `bbc-cli import` can seed rows for the bootstrap `zeths-bbc` tenant. Set `BBC_MODE=db`, restart dev server, sign in, hit `/queue` + `/log` + `/bindings`, confirm rows render with parity to file-mode.

### Gaps Summary

**Two real gaps; one is a non-blocking duplication, the other is the predictable parity-tax risk that ADR-0004's two-mode architecture imposes.**

**Gap 1 (failed, non-blocking): Frontmatter parser duplicated.** `packages/store/src/local/frontmatter.ts` is a copy of `apps/dashboard/src/lib/frontmatter.ts`. The new copy's header comment is honest about the duplication. The cheap fix is a CI diff check; the durable fix is a `packages/utils/` workspace consumed by both. Either way, this is the kind of latent drift that the parity-tax risk in ADR-0004 §Risks anticipated. It does not block Phase 3 — both copies work today — but it WILL silently break when the dashboard adds a frontmatter feature (e.g., multi-line YAML) that the @bbc/store copy doesn't get.

**Gap 2 (uncertain, deferred-by-design): DB-mode never exercised end-to-end.** All Phase 2 smoke tests ran in file-mode. SupabaseStore type-checks, builds, and statically reads correctly — but the wire was never tugged. That's intentional per the plan's deferral of bulk backfill to Phase 7's `bbc-cli import`. The risk: until Phase 7 lands AND a verifier flips `BBC_MODE=db` against a seeded tenant, every claim about RLS, member-scoped reads, and trigger semantics is INFERRED rather than VERIFIED. Flag for Phase 7 to schedule the smoke test as a release gate.

**No functional regression detected.** Type-check, build, and dev-server probes all match Phase 1's baseline (10 → 11 routes; the `_not-found` page is the only new one and is part of Next.js auto-generation). The shim refactor preserved every page-level import; pages are byte-identical to Phase 1 except for what they consume from the shim, which is contractually unchanged.

**One forward-looking flag for Phase 3:** SupabaseLogStore's `lkg()` is defined as `max(v)` over operations_log. File-mode reads `_log/lkg.txt` as a separate pointer. Once Phase 3 introduces concurrent emitters (multiple acceptProposal calls landing rows simultaneously), the two definitions of LKG can drift if a separate lkg pointer is also added later. Cleanest path: pick one definition, document it in deployment-modes.md §Mapping, and stick with it.

**Recommendation:** Phase 2 may close subject to (a) accepting the frontmatter duplication as a deferred Phase-3-cleanup item, (b) committing to run the BBC_MODE=db smoke as a Phase 7 release gate, and (c) running the live-DB human verification (probes #1 + #2) before Phase 3 starts to confirm the trigger functions actually have the documented security posture in the live DB.

---

_Verified: 2026-05-09_
_Verifier: Claude (gsd-verifier, Opus 4.7 1M)_
