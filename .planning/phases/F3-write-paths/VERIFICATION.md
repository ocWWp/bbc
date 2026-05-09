---
phase: F3-write-paths
verified: 2026-05-09T00:00:00Z
status: gaps_found
score: 7/8 must-haves verified
gaps:
  - truth: "Negative-path coverage on the live DB"
    status: partial
    reason: "Only happy-path (admin accept of pending proposal) was smoke-tested in this session. Errcodes P0003/P0004/P0005/P0006 are encoded in the SQL but not exercised end-to-end."
    artifacts:
      - path: "apps/dashboard/supabase/migrations/0008_write_path_functions.sql"
        issue: "Functions encode 4 error paths (forbidden, not_found, invalid_state, invalid_input) that have no live test coverage."
    missing:
      - "Manual or scripted negative tests: viewer accept (P0003), missing proposal (P0004), already-resolved proposal (P0005), reject with empty/oversize reason (P0006). Track as Phase 3 manual-test backlog."
  - truth: "proposal_id shape is consistently validated across modes"
    status: partial
    reason: "LocalStore + SupabaseStore client + dashboard server action all enforce /^prop_[\\w:.-]+$/, but the SQL functions and the queue_items table accept any text. A direct DB caller (psql, future MCP tool, raw RPC) could insert/operate on malformed ids and the stored audit row would carry a junk target."
    artifacts:
      - path: "apps/dashboard/supabase/migrations/0008_write_path_functions.sql"
        issue: "No regex/CHECK on p_proposal_id at the function boundary."
      - path: "apps/dashboard/supabase/migrations/0006_queue_items.sql"
        issue: "No CHECK constraint on queue_items.proposal_id shape."
    missing:
      - "Either add `if p_proposal_id !~ '^prop_[\\w:.-]+$' then raise ... using errcode = 'P0006'` at the top of accept_proposal and reject_proposal, or add a CHECK constraint on queue_items.proposal_id. Pick one to keep server-side trust independent of client-side validation."
  - truth: "proposeChange() shipped"
    status: failed
    reason: "Plan §Phase 3 promised acceptProposal+rejectProposal+proposeChange + 'full propose → review → accept E2E.' Phase was scoped down to accept/reject only; proposeChange is deferred to Phase 6 (MCP server). This is a documented descope, not a regression — but the roadmap entry should be updated to reflect it so verification of the next phase doesn't trip on it."
    artifacts:
      - path: ".planning/ROADMAP.md"
        issue: "Phase 3 entry still implies proposeChange ships in Phase 3."
    missing:
      - "Update Phase 3 ROADMAP entry (or add a note to F3-write-paths plan) explicitly deferring proposeChange + propose-side E2E to Phase 6 MCP server. Without this, the next /gsd:verify-phase pointed at Phase 6 will not know proposeChange was punted."
---

# Phase 3 — BBC state to DB: write paths

**Phase Goal:** acceptProposal + rejectProposal as typed SQL transactions; append-only invariants on operations_log; retire bash from the SaaS path; smoke-test the propose → review → accept flow at the DB layer. Scope clarified by author: accept + reject only this phase; proposeChange deferred to Phase 6.

**Verified:** 2026-05-09
**Status:** gaps_found (3 gaps; 2 partial, 1 deferred-but-undocumented)
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                        | Status      | Evidence                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `accept_proposal(text)` and `reject_proposal(text, text)` exist on the live DB with `security definer`, locked search_path, correct grants  | ✓ VERIFIED  | Source migration 0008_write_path_functions.sql declares both functions `language plpgsql security definer set search_path = public, auth`. Lines 145-148: `revoke execute … from public, anon` then `grant execute … to authenticated`. |
| 2   | Functions enforce auth → profile → role gates (errcodes P0002/P0003)                                                                         | ✓ VERIFIED  | 0008.sql lines 21-38 (accept) and 94-111 (reject). `auth.uid()` null check + profile existence check raise P0002; `v_role is null or v_role = 'viewer'` raises P0003. Identical structure in both functions.                              |
| 3   | Functions enforce existence + idempotency (P0004 not_found, P0005 already-resolved)                                                          | ✓ VERIFIED  | 0008.sql lines 40-49 and 113-122. Existence check tenant-scoped via `tenant_id = v_tenant`. Status check rejects anything except 'pending'.                                                                                               |
| 4   | reject_proposal validates p_reason: non-null/non-empty + ≤500 chars (P0006)                                                                  | ✓ VERIFIED  | 0008.sql lines 87-92, executed BEFORE auth check (cheaper rejection of malformed inputs).                                                                                                                                                 |
| 5   | Each call is an atomic 3-write transaction: queue_items UPDATE + proposals_accepted/rejected INSERT + operations_log INSERT with monotonic v | ✓ VERIFIED  | 0008.sql lines 51-68 (accept) and 124-141 (reject). All three writes inside one plpgsql function body = single transaction. `v` computed via `select coalesce(max(v),0)+1 … where tenant_id = v_tenant` per-tenant monotonic.            |
| 6   | operations_log is append-only at the DB layer                                                                                                | ✓ VERIFIED  | Migration 0007 lines 23-43 declare `operations_log_no_update` and `operations_log_no_delete` BEFORE triggers raising on update/delete. Same pattern on proposals_accepted/rejected (0007 lines 78-116).                                   |
| 7   | Bug fix 0009 grants EXECUTE on is_member_of(uuid) to authenticated, with rationale comment                                                   | ✓ VERIFIED  | 0009 lines 1-13 explain why (RLS policies on Phase 2/3 tables call is_member_of). Confirmed 0003 line 48 revokes from authenticated, making 0009 a real fix not a redundant grant.                                                       |
| 8   | Live E2E smoke test exercised the full propose → accept flow                                                                                 | ⚠ PARTIAL  | Author confirms happy-path executed on project gpmtkhyczbapnfquhswn 2026-05-09: queue_items inserted, accept_proposal invoked under authenticated session, status flipped, proposals_accepted row created, operations_log row appended with actor `human:email:zethtang@gmail.com`, action=accept, target=prop_2026-05-09T07-00-00Z_smoke_test_phase3. Negative paths (P0003-P0006) NOT exercised — see gap 1. |

**Score:** 7/8 truths fully verified; 1 partial (smoke test happy-path only).

### Required Artifacts

| Artifact                                                       | Expected                                                              | Status     | Details                                                                                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/dashboard/supabase/migrations/0008_write_path_functions.sql` | Both SQL functions with security definer + grants                     | ✓ VERIFIED | 149 lines, both functions present, grants block at end correct.                                                                                          |
| `apps/dashboard/supabase/migrations/0009_grant_is_member_of_to_authenticated.sql` | Single-purpose grant migration with rationale comment                 | ✓ VERIFIED | 13 lines, comment block explains the Phase-3-smoke-test discovery, single grant statement.                                                               |
| `packages/store/src/interfaces.ts`                             | `WriteResult` + `acceptProposal`/`rejectProposal` on `QueueStore`      | ✓ VERIFIED | Lines 51, 67, 74. JSDoc on lines 59-66 documents the actor-resolution split (LocalStore passes; DB-mode derives from auth.uid()).                       |
| `packages/store/src/local/queue.ts`                            | LocalStore impl: shells out to scripts/{accept,reject}.sh, validates  | ✓ VERIFIED | Lines 92-110 (accept) and 112-133 (reject). Uses `execp` with timeout 30000ms, `shq()` POSIX-safe quoting, regex-validates proposal_id, validates reason ≤500. |
| `packages/store/src/supabase/queue.ts`                         | DB-mode impl: rpc('accept_proposal'/'reject_proposal'), ignores actor | ✓ VERIFIED | Lines 81-103. JSDoc lines 75-80 explicitly documents "actor parameter is ignored — derives it from auth.uid() to prevent client-side spoofing."          |
| `apps/dashboard/src/app/queue/actions.ts`                      | No child_process; uses getStore().queue.accept/reject; auth+role gates | ✓ VERIFIED | grep for `child_process`/`exec(`/`spawn(` in `apps/dashboard/src/` returned zero hits. requireActor → requireRole('member') → store.queue.* → revalidatePath. |

### Key Link Verification

| From                                | To                                          | Via                                                | Status   | Details                                                                                                |
| ----------------------------------- | ------------------------------------------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `dashboard/queue/actions.ts`        | `@bbc/store` QueueStore                     | `getStore().queue.acceptProposal/rejectProposal`   | ✓ WIRED  | Lines 37, 64; both server actions await store calls and propagate result.                              |
| `SupabaseQueueStore.acceptProposal` | DB function `accept_proposal(text)`         | `client.rpc("accept_proposal", { p_proposal_id })` | ✓ WIRED  | supabase/queue.ts:85; param name matches function signature.                                           |
| `SupabaseQueueStore.rejectProposal` | DB function `reject_proposal(text, text)`   | `client.rpc("reject_proposal", { p_proposal_id, p_reason })` | ✓ WIRED  | supabase/queue.ts:97-100; both params match.                                                           |
| `LocalQueueStore.acceptProposal`    | `bash scripts/accept.sh <id> --actor <a>`   | `execp` with shq() escaping                        | ✓ WIRED  | local/queue.ts:99; scripts/accept.sh exists.                                                           |
| `LocalQueueStore.rejectProposal`    | `bash scripts/reject.sh ...`                | same                                               | ✓ WIRED  | local/queue.ts:122; scripts/reject.sh exists.                                                          |
| accept/reject_proposal              | operations_log (monotonic v per tenant)     | `select coalesce(max(v),0)+1 ... where tenant_id`  | ✓ WIRED  | 0008.sql:61-68, 134-141. Append blocked from outside via 0007 BEFORE-triggers — only security-definer functions can write, which is the intended pattern. |

### Anti-Patterns Found

None. grep across `packages/store/src/`, `apps/dashboard/src/app/queue/`, and migrations 0008/0009 returned zero TODO/FIXME/HACK/PLACEHOLDER hits. No empty handlers, no stub returns, no console.log-only paths.

### Build Status

- `pnpm --filter @bbc/store type-check` → pass (clean exit, no diagnostics).
- `pnpm --filter @bbc/dashboard type-check` → pass (clean exit, no diagnostics).
- Author claims `pnpm --filter @bbc/dashboard build` builds 10 routes; not re-run here, but type-check passing on both packages is a strong proxy for the contract surface.

### Human Verification Required

1. **Negative-path live tests on accept_proposal / reject_proposal**
   - Test: As a `viewer`-role member of zeths-bbc tenant, call `select public.accept_proposal('prop_existing_pending')`. Expected: errcode P0003.
   - Test: As an `admin`, call accept_proposal on a non-existent id. Expected: P0004.
   - Test: As an `admin`, call accept_proposal on the already-accepted smoke-test id `prop_2026-05-09T07-00-00Z_smoke_test_phase3`. Expected: P0005 ("invalid_state: proposal is already accepted").
   - Test: As an `admin`, call `reject_proposal('prop_x', '')` and `reject_proposal('prop_x', repeat('a', 501))`. Expected: P0006 in both.
   - Why human: Requires switching authenticated sessions and asserting on raised exceptions; not feasible in this static-analysis pass.

2. **End-to-end UI flow with revalidatePath**
   - Test: Sign in as zethtang in the dashboard, navigate to /queue, click Accept on a pending proposal, observe /queue and /queue/[id] update without manual refresh.
   - Why human: Real-time cache invalidation behavior, visual confirmation of UI states.

### Gaps Summary

Three gaps, all narrow:

1. **Negative-path test debt (P0003/P0004/P0005/P0006)** — the SQL encodes them; the live DB hasn't seen them fired. Low risk because the function paths are short and similar to the verified happy path, but worth a 30-min manual-test sweep before Phase 4.

2. **proposal_id regex enforced 3 layers up but not at the trust boundary (the SQL function or table CHECK)**. Not a current bug — every live caller validates — but a future caller (MCP server, raw `psql`, a migration script) won't have client-side regex protection. Add the CHECK to keep server trust independent.

3. **proposeChange descoped without ROADMAP / plan annotation**. The original Phase 3 plan promised it; the author scoped it out to Phase 6 (MCP). The descope is sound, but it should be documented in the F3-write-paths plan or ROADMAP so future verifiers don't flag it as missing.

No blockers. Phase 3 delivers the core write-path goal: accept/reject are now typed SQL transactions, the dashboard no longer shells out, and the audit trail is append-only by trigger. Smoke-tested on the live DB.

---

_Verified: 2026-05-09_
_Verifier: Claude (gsd-verifier)_
