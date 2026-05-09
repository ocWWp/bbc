---
phase: F4-onboarding
verified: 2026-05-09T00:00:00Z
status: gaps_found
score: 1/4 must-haves verified
gaps:
  - truth: "Migration 0011 (create_tenant_with_seed SECURITY DEFINER function) exists on disk and is committed alongside templates"
    status: failed
    reason: "No file at apps/dashboard/supabase/migrations/0011_create_tenant_with_seed.sql; no SQL anywhere in the repo defines create_tenant_with_seed. The only reference to it is a single mention in templates/initial-tenant/README.md."
    artifacts:
      - path: "apps/dashboard/supabase/migrations/0011_create_tenant_with_seed.sql"
        issue: "MISSING — migrations directory ends at 0010_proposal_id_check_constraint.sql"
    missing:
      - "Create 0011 with SECURITY DEFINER function create_tenant_with_seed(p_slug, p_name, p_owner_user_id) returning uuid"
      - "REVOKE EXECUTE from public/anon/authenticated; GRANT to service_role only"
      - "Validate owner exists (P0004 not_found) and rely on tenants.slug CHECK regex"
      - "Insert: 1 tenants row, 1 tenant_members(admin), 3 memory_files, 3 bindings, 1 queue_items, 1 operations_log(action='tenant_bootstrap', v=1) atomically"
  - truth: "Live smoke test bootstrapped a tenant phase4-test and verified all 6 child-table shapes; cleaned up via cascade DELETE"
    status: failed
    reason: "Cannot verify — the function the smoke test exercised does not exist in any migration file. If the test ran against a live Supabase project, it ran against an unversioned, undeployable function. No artifacts in the repo capture or reproduce the smoke test (no test fixture, no SQL script, no notes file in this phase dir)."
    artifacts:
      - path: ".planning/phases/F4-onboarding/"
        issue: "Directory was empty before verification; no PLAN.md, no SUMMARY.md, no smoke-test capture"
    missing:
      - "Migration 0011 committed so the smoke test is reproducible"
      - "A SUMMARY.md in this phase dir documenting the smoke test run, row counts, and cleanup"
      - "SQL verifying REVOKE landed (e.g. has_function_privilege('authenticated', ...) returns false)"
  - truth: "No regressions in earlier migrations or the existing zeths-bbc tenant"
    status: partial
    reason: "Migrations 0001-0010 are present and unchanged on disk (verified by directory listing). The zeths-bbc tenant invariants cannot be reverified without running SQL — and since 0011 was never committed, there is also no risk surface from this phase. Effective status: no regression risk introduced because no DB change landed."
    artifacts: []
    missing:
      - "If 0011 is added later, re-run regression check against zeths-bbc (1 tenant, 2 members, profiles unchanged)"
---

# Phase F4-onboarding Verification Report

**Phase Goal:** Onboarding backend — new user signup auto-creates a tenant seeded from `bbc/templates/initial-tenant/` (CLAUDE.md, _schema.md, sample ADR, default bindings, sample queue item) via a `create_tenant_with_seed` SECURITY DEFINER SQL function.
**Scope (per prompt):** Backend only. Signup-without-invitation UX → Phase 9. 3-screen welcome tour → Phase 11.
**Verified:** 2026-05-09
**Status:** gaps_found
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Templates directory exists with all 6 required files at correct paths | VERIFIED | `templates/initial-tenant/{README.md, CLAUDE.md, bindings.yaml}`, `memory/_schema.md`, `memory/decisions/0001-bbc-tenant-bootstrap.md`, `queue/sample.md` — all present, substantive, with TEMPLATE_DATE/TEMPLATE_OWNER placeholders |
| 2   | Migration 0011 defines `create_tenant_with_seed` SECURITY DEFINER function | FAILED | File does not exist. `apps/dashboard/supabase/migrations/` ends at 0010. `grep create_tenant_with_seed` returns one hit total (in `templates/initial-tenant/README.md` mentioning the function by name) |
| 3   | Smoke test bootstrapped `phase4-test`, verified row counts, cleaned up | FAILED | No reproducible artifact in repo. Function does not exist to be invoked |
| 4   | No regressions vs Phase 3 (migrations 0001-0010 intact, zeths-bbc untouched, dashboard build) | PARTIAL | Migrations 0001-0010 present unchanged on disk. No risk introduced because no DB change landed. zeths-bbc invariants not re-verified |

**Score:** 1/4 truths verified (1 partial counted as not-verified for scoring).

### Required Artifacts

| Artifact | Expected | Exists | Substantive | Wired | Status |
| -------- | -------- | ------ | ----------- | ----- | ------ |
| `templates/initial-tenant/README.md` | Describes purpose + sync rule | Yes | Yes (24 lines, clear sync-with-0011 callout) | N/A | VERIFIED |
| `templates/initial-tenant/CLAUDE.md` | Main shell, 6 principles, mode-aware | Yes | Yes (32 lines, principles 1-6 present, principle 1 mentions file/RLS modes) | N/A | VERIFIED |
| `templates/initial-tenant/memory/_schema.md` | Frontmatter spec | Yes | Yes (45 lines, full field rules + naming) | N/A | VERIFIED |
| `templates/initial-tenant/memory/decisions/0001-bbc-tenant-bootstrap.md` | Sample ADR with placeholders | Yes | Yes (38 lines, TEMPLATE_DATE/TEMPLATE_OWNER tokens present) | N/A | VERIFIED |
| `templates/initial-tenant/bindings.yaml` | 3 unbound roles | Yes | Yes (db-provider, llm-provider, email-delivery — all unbound) | N/A | VERIFIED |
| `templates/initial-tenant/queue/sample.md` | One pending sample proposal | Yes | Yes (33 lines, status: pending, prop_TEMPLATE_DATE_sample_first_proposal) | N/A | VERIFIED |
| `apps/dashboard/supabase/migrations/0011_create_tenant_with_seed.sql` | SECURITY DEFINER bootstrap fn | **No** | — | — | **MISSING** |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `create_tenant_with_seed()` | `tenants` / `tenant_members` / `memory_files` / `bindings` / `queue_items` / `operations_log` | INSERT inside SECURITY DEFINER fn | NOT_WIRED | Function does not exist; no INSERT path defined |
| `templates/initial-tenant/*` content | Inline strings in migration 0011 | Hand-sync (per README) | NOT_WIRED | No migration to inline-sync against; sync gap is moot until 0011 lands |
| `authenticated` role | `create_tenant_with_seed()` | REVOKE EXECUTE | UNVERIFIABLE | Cannot verify revoke until function exists. **Security-relevant** — without revoke, any signed-in user could mint arbitrary tenants |
| Future signup endpoint | `create_tenant_with_seed()` | service_role JWT | NOT_WIRED | No endpoint, no migration; deferred to Phase 9 per prompt scope |

### Requirements Coverage

No PLAN.md / requirements file was authored for this phase prior to verification (the F4-onboarding directory was empty). Truths derived from the prompt's "Specific claims to verify" section. Recommend authoring a backfilled PLAN.md alongside the gap-closure work.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| `templates/initial-tenant/README.md:17` | "kept in sync via this template directory" — hand-sync between markdown templates and inlined SQL strings, no CI check | Warning | Drift between templates/ and migration 0011 will be invisible until manually compared. Future enhancement: a `scripts/check-template-sync.sh` |
| `templates/initial-tenant/queue/sample.md` references "Phase 6+ feature when MCP is integrated" | Forward reference in user-facing seed copy | Info | Acceptable — first-time tenants will see a dated reference; revisit at Phase 6 launch |
| `templates/initial-tenant/README.md:23` | "tenants.plan column doesn't yet capture template version" | Info | Known limitation; no template-versioning column on tenants. Reasonable to defer until templates evolve materially |

### Human Verification Required

1. **Confirm whether the live smoke test was actually run.** The prompt asserts a smoke test on a `phase4-test` tenant, but no migration exists to deploy. Was the function defined ad-hoc against a dev Supabase project (and therefore lost on next reset), or is the prompt describing intended-but-not-executed work?
   - Expected: either (a) a saved SQL script the smoke test ran, or (b) acknowledgment that the smoke test is pending until 0011 is committed
   - Why human: cannot verify a live DB state from static repo inspection

2. **Verify revoke posture once 0011 lands.** Run in SQL editor:
   ```sql
   select has_function_privilege('authenticated', 'public.create_tenant_with_seed(text,text,uuid)', 'execute');
   -- expect: false
   select has_function_privilege('service_role', 'public.create_tenant_with_seed(text,text,uuid)', 'execute');
   -- expect: true
   ```
   - Why human: requires live DB connection, only meaningful post-migration

### Gaps Summary

The **templates directory side of Phase 4 is solid** — six well-written, internally consistent seed files with placeholder tokens that survive a copy-paste bootstrap. README correctly flags the file/SQL sync risk.

The **SQL backend side is absent**: migration 0011 does not exist. Every claim that depends on it (smoke test results, revoke verification, atomic 6-row insert) is unverifiable. The phase as described is roughly half-shipped — the static seed exists, the bootstrap function does not.

**Top 3 gaps:**

1. **Migration 0011 missing.** No `0011_create_tenant_with_seed.sql` anywhere in the repo. Single highest-priority gap; everything else cascades from this.
2. **No reproducible smoke-test capture.** Even if the function was defined ad-hoc against a live project, there is no SQL script, fixture, or notes file in `.planning/phases/F4-onboarding/` to reproduce the run. Future contributors cannot rerun the verification.
3. **Revoke posture unverified.** The function (when it lands) must REVOKE EXECUTE from `authenticated` — otherwise any signed-in user can mint tenants for arbitrary owner_user_id values. Add a SQL assertion in 0011 or a follow-up migration that fails CI if the privilege is granted.

**Flagged for later phases (informational, not blocking F4):**
- Slug collision raises unique-violation rather than a typed error — caller's job to retry. Acceptable for now; Phase 9 signup endpoint should map this to a friendly error.
- Multi-tenant-per-user UX gap: `auth_tenant()` returns first-joined; users with both an invitation and a self-created tenant only see the older one. Phase 6 work.
- Template/SQL drift detection has no CI check. Add to Phase 11 polish.

---

_Verified: 2026-05-09_
_Verifier: Claude (gsd-verifier)_
