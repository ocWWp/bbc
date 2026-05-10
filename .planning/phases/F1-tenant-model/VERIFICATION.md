---
phase: F1-tenant-model
verified: 2026-05-08T00:00:00Z
status: gaps_found
score: 11/14 must-haves verified
parts:
  - part: A
    status: gaps_found
    score: 5/6
  - part: B
    status: gaps_found
    score: 6/8
gaps:
  - truth: "No stale path/leaf references remain in updated docs after the move"
    status: partial
    reason: "apps/dashboard/README.md still references `.bbc-leaf/README.md` and `../bbc/distribution/dashboard/CLAUDE.md` (both stale: .bbc-leaf was removed, and the relative path is from standalone-repo days; from the monorepo location the leaf lives at `../../distribution/dashboard/CLAUDE.md`)."
    artifacts:
      - path: "apps/dashboard/README.md"
        issue: "Line 96-99: 'See `.bbc-leaf/README.md` for the back-pointer convention.' refers to a directory removed during the move; the `Connection to BBC` block points at `../bbc/distribution/dashboard/CLAUDE.md` which is the standalone-repo path."
    missing:
      - "Update apps/dashboard/README.md `Connection to BBC` section to drop the `.bbc-leaf` back-pointer convention (no longer applicable in monorepo) and fix the path to `../../distribution/dashboard/CLAUDE.md`."
  - truth: "Documentation reflects the new tenant-model + invitation gate (no stale 'allowlist' narrative)"
    status: failed
    reason: "Auth-narrative docs were not updated after the schema migration. The leaf doc still says 'every signed-in user has full Accept/Reject power' (now false: `viewers` cannot Accept/Reject because `requireRole(actor, 'member')` gates both server actions). README and signin UI copy still tell users they need to be on the 'allowlist' — that table no longer exists; the gate is now `tenant_invitations`."
    artifacts:
      - path: "apps/dashboard/README.md"
        issue: "Lines 3, 36, 49, 55, 58, 67 narrate sign-up as gated by `public.allowlist` and reference 'trust-the-allowlisted-user'. The seed-SQL snippet at line 58 (`insert into public.allowlist(...)`) will fail at runtime — the table is dropped. Onboarding instructions for a new self-host operator are now misleading."
      - path: "distribution/dashboard/CLAUDE.md"
        issue: "Lines 66, 68, 69, 81 describe the `public.allowlist` BEFORE-INSERT trigger and assert 'every allowlisted user has full Accept/Reject power' / 'No per-user RBAC'. Both are now wrong: `tenant_invitations` is the gate, and `requireRole` enforces a viewer/member/admin hierarchy in `actions.ts`."
      - path: "apps/dashboard/src/app/auth/signin/SignInForm.tsx"
        issue: "Line 119 user-facing error string: 'You're not on the allowlist for this dashboard. Ask the admin to add you.' — wording still references the dropped table."
      - path: "apps/dashboard/src/app/auth/signin/page.tsx"
        issue: "Lines 14 and 63 echo the same 'allowlist' wording in the SSR error fallback and the form helper text."
    missing:
      - "Rewrite the auth-narrative blocks in `apps/dashboard/README.md` to reference `tenant_invitations` instead of `allowlist`, and replace the seed-SQL snippet with the new (tenant_id, provider, identifier, role) shape."
      - "Update `bbc/distribution/dashboard/CLAUDE.md` 'Hard constraint: invite-only hosting' and 'What's NOT in V1' sections: the role hierarchy (admin/member/viewer) is now implemented via `requireRole`, so the 'No per-user RBAC' bullet is stale; per-user role-based permissions ARE present at the server-action layer (still missing for tenant-management UI, which is Phase 5)."
      - "Soften the user-facing copy in `signin/page.tsx` and `signin/SignInForm.tsx` from 'allowlist' to 'invite list' or 'invitation' so the wording is decoupled from the implementation table name."
  - truth: "Live Supabase schema state matches the source migrations"
    status: uncertain
    reason: "This verifier session does not have access to `mcp__supabase__list_tables` or `execute_sql` (the tools the prompt asked the verifier to use). Schema verification therefore relies on three indirect signals — all consistent with the claims, but none equivalent to a `SELECT` against the live DB."
    artifacts:
      - path: "apps/dashboard/supabase/migrations/0003_tenant_model.sql"
        issue: "Source-of-truth migration on disk matches every column/constraint/policy/function claim in the prompt (tenants pk + slug regex, tenant_members composite PK + role enum, `is_member_of` security-definer with revoked execute, `auth_tenant` security-invoker, two RLS policies)."
      - path: "apps/dashboard/supabase/migrations/0004_migrate_allowlist_to_tenant_invitations.sql"
        issue: "Migration drops `public.allowlist`, drops `check_allowlist()` and `create_profile_for_user()`, swaps to `check_invitation_before_insert` + `create_profile_and_membership_after_insert` with `security definer` and `set search_path = public, auth`, replaces `profiles_self_read` with `profiles_self_in_tenant_read`, and bootstraps the existing zethtang user into a `zeths-bbc` tenant. Matches every claim in the prompt."
      - path: "apps/dashboard/src/lib/supabase/database.types.ts"
        issue: "Regenerated types include `tenants`, `tenant_members`, `tenant_invitations`, `tenant_role` enum, and the `auth_tenant`/`is_member_of` functions; `allowlist` is absent. These types are emitted from the live DB by Supabase's generator, so this is strong indirect confirmation that the live DB matches the migrations on disk. `pnpm type-check` passes."
    missing:
      - "When a session with `mcp__supabase__execute_sql` is available, run: (1) `select id,slug,name,plan,created_by from public.tenants` — expect 1 row `zeths-bbc`; (2) `select tenant_id,user_id,role from public.tenant_members` — expect 1 admin row for zethtang; (3) `select tenant_id,provider,identifier,role from public.tenant_invitations` — expect 2 admin rows; (4) `select user_id,tenant_id from public.profiles` — zethtang's tenant_id matches; (5) `\\d public.allowlist` — should error 'relation does not exist'; (6) `\\df public.check_allowlist` and `\\df public.create_profile_for_user` — should both return zero rows; (7) `select tgname from pg_trigger where tgrelid = 'auth.users'::regclass` — expect `check_invitation_before_insert` and `create_profile_and_membership_after_insert`, no `check_allowlist_*` or `create_profile_after_insert`."
      - "Run the recursion smoke test on `tenant_members` (`set role authenticated; set request.jwt.claim.sub = '<zethtang_user_id>'; select * from public.tenant_members;`) to confirm `is_member_of` does not infinite-loop. The migration is structured to avoid this (the function is `security definer`, so its inner select bypasses the policy on the same table), but a live probe is the only way to be sure."
human_verification:
  - test: "Live signup smoke test for the three E2E scenarios"
    expected: "(a) signup with `random-not-invited@example.com` → `{code:'P0001', message:'not_invited'}`. (b) signup with `newteamuser@example.com` → `not_invited`. (c) signup with the invited `phase1test@gmail.com` → 200 + new user, with a profiles row whose tenant_id matches the invitation's tenant_id, and a tenant_members row with role=member."
    why_human: "Requires Supabase Auth network access + the ability to insert/clean up auth.users rows. The session that ran the migration claims these results; this verifier could not re-execute them without mcp__supabase tools."
  - test: "Cross-tenant RLS isolation"
    expected: "Once a second tenant exists (Phase 5 invite UI), a member of tenant A cannot SELECT tenant B's invitations, profiles, or memberships. Today only one tenant exists, so this cannot be exercised end-to-end."
    why_human: "Needs a second tenant + a second authed session; not reproducible from migrations alone."
---

# Phase F1: Tenant Model + Auth Generalization — Verification Report

**Phase Goal:** Move bbc-dashboard into the BBC monorepo as `apps/dashboard/` (Part A), then add tenant-scoped auth/data (Part B). Sets the foundation for multi-tenant SaaS hosting.

**Plan reference:** `/Users/grid/.claude/plans/i-need-you-to-merry-teacup.md` § "Phase 1 — Tenant model + auth generalization"; sub-plan in `bbc/memory/tech/repo-structure.md` § "Migration plan".

---

## Part A — Monorepo migration (bbc-dashboard → apps/dashboard/)

**Verified:** 2026-05-08
**Status:** gaps_found (1 minor doc-reference gap; all functional claims verified)
**Re-verification:** No — initial verification.

### Observable Truths

| #   | Truth                                                                                                | Status     | Evidence                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | bbc/ is now a pnpm workspace with apps/dashboard as a member                                         | VERIFIED   | `bbc/package.json` declares `bbc-monorepo` with workspace scripts (`dev`, `build`, `type-check`); `pnpm-workspace.yaml` declares `apps/*` and `packages/*`; `node_modules/.pnpm` exists at root.                      |
| 2   | The dashboard contents moved into bbc/apps/dashboard with workspace name @bbc/dashboard              | VERIFIED   | `bbc/apps/dashboard/package.json` `name: "@bbc/dashboard"`; `src/`, `supabase/`, `tsconfig.json`, `next.config.ts`, `README.md`, `.env.example`, `.env.local`, `.gitignore` all present. `.bbc-leaf/` removed.        |
| 3   | Path resolution updated so the dashboard finds the BBC root from its new location                    | VERIFIED   | `src/lib/bbc-paths.ts` line 17: `path.resolve(process.cwd(), "..", "..")` — moved from `../bbc` to `../../`. Comment block confirms intent: "Monorepo default: ../../ relative to this package (apps/dashboard/ → bbc/)". |
| 4   | The dashboard builds and serves all expected routes                                                  | VERIFIED   | `.next/server/app` contains `page`, `auth/{callback,signin,signout}`, `bindings`, `graph`, `log`, `queue`, `queue/[id]`, `skills` (all 10 expected routes). Live probes: `/`=307, `/auth/signin`=200, `/queue`=307.    |
| 5   | The standalone repo at /Users/grid/Documents/GitHub/bbc-dashboard is preserved as a rollback safety | VERIFIED   | `ls /Users/grid/Documents/GitHub/bbc-dashboard/` returns the original tree (`src`, `supabase`, `package.json`, `package-lock.json`, `tsconfig.json`, etc.).                                                            |
| 6   | No stale path/leaf references remain in the updated docs after the move                              | PARTIAL    | `bbc/.claude/commands/bbc/dashboard.md`, `bbc/distribution/dashboard/CLAUDE.md`, and source files are clean. **But** `bbc/apps/dashboard/README.md` line 99 still references `.bbc-leaf/README.md` (dir removed) and line 96 the standalone-relative path `../bbc/distribution/dashboard/CLAUDE.md`. |

**Score:** 5/6 truths fully verified, 1 partial.

### Required Artifacts

| Artifact                                       | Expected                                            | Status     | Details                                                                                       |
| ---------------------------------------------- | --------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `bbc/package.json`                             | name=bbc-monorepo, workspace scripts                | VERIFIED   | Filters via `pnpm --filter @bbc/dashboard` for dev; `pnpm -r` for build/type-check/lint.      |
| `bbc/pnpm-workspace.yaml`                      | declares apps/* and packages/*                      | VERIFIED   | Two-line YAML, both globs present.                                                            |
| `bbc/node_modules/`                            | pnpm install succeeded                              | VERIFIED   | `node_modules/.pnpm/` store populated.                                                        |
| `bbc/apps/dashboard/`                          | full dashboard tree                                 | VERIFIED   | All required files present; `.bbc-leaf/` correctly absent; `package-lock.json` and `pnpm-lock.yaml` correctly absent (single root lockfile policy). |
| `bbc/apps/dashboard/.env.local`                | carries Supabase URL + publishable key              | VERIFIED   | File present, contains 3 Supabase-keyed entries (URL + key + service role).                   |
| `bbc/apps/dashboard/src/lib/bbc-paths.ts`      | default fallback resolves to bbc root from new loc  | VERIFIED   | `path.resolve(process.cwd(), "..", "..")` — correct for `apps/dashboard/` → `bbc/`.           |
| `bbc/apps/dashboard/.next/`                    | build artifacts produced                            | VERIFIED   | All 10 expected routes compiled.                                                              |
| `/Users/grid/Documents/GitHub/bbc-dashboard/` | standalone repo preserved (rollback)                | VERIFIED   | Tree intact.                                                                                  |
| `bbc/.gitignore`                               | includes `node_modules`                             | VERIFIED   | Line 25.                                                                                      |

### Key Link Verification

| From                              | To                                       | Via                                | Status     | Details                                                                  |
| --------------------------------- | ---------------------------------------- | ---------------------------------- | ---------- | ------------------------------------------------------------------------ |
| `bbc/package.json` `dev` script   | `@bbc/dashboard` package                 | `pnpm --filter @bbc/dashboard dev` | WIRED      | Filter target matches the package's `name` field.                        |
| `apps/dashboard/src/lib/bbc-paths.ts` | bbc root (queue/, _log/, etc.)        | `process.cwd() + ../../`           | WIRED      | From `apps/dashboard/`, `../../` resolves to `bbc/`.                     |
| `apps/dashboard/.env.local`       | Supabase project                         | `NEXT_PUBLIC_SUPABASE_URL` + keys  | WIRED      | Keys present; dev server returns 200 on `/auth/signin` (auth bootstraps). |
| Distribution leaf doc             | New monorepo location                    | textual reference                  | WIRED      | `bbc/distribution/dashboard/CLAUDE.md:48-54` says dashboard now lives at `bbc/apps/dashboard/` and cites ADR-0004. |
| `/bbc:dashboard` slash command    | New monorepo path                        | hardcoded fallback path            | WIRED      | `bbc/.claude/commands/bbc/dashboard.md:18` defaults to `/Users/grid/Documents/GitHub/bbc/apps/dashboard`. |
| `apps/dashboard/README.md`        | Distribution leaf back-pointer           | relative path + `.bbc-leaf` ref    | NOT_WIRED  | Both references stale (see Gap 1).                                       |

### Anti-Patterns Found

| File                                | Line  | Pattern                                       | Severity | Impact                                                                                              |
| ----------------------------------- | ----- | --------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `apps/dashboard/README.md`          | 96-99 | Stale path + dead `.bbc-leaf` cross-reference | Warning  | Future contributor reading the README is told to go to a non-existent file and a wrong relative path. Doesn't break runtime. |

No TODO/FIXME/PLACEHOLDER scaffolding found in the migrated source. No empty handlers introduced.

### Out-of-scope confirmations (not flagged as gaps)

- Part B (tenant-model SQL migration, multi-tenant auth generalization) is explicitly deferred — not flagged.
- `MemoryStore` / `QueueStore` interface refactor and per-vendor swap-test are Phase 2 work — not flagged.
- Archiving the `ZethT/bbc-dashboard` GitHub repo is a manual step the user owns — not flagged.
- `bbc/memory/tech/repo-structure.md` and `.planning/phases/D*/SUMMARY.md` mentions of `bbc-dashboard` are historical migration documentation, not live path references — not flagged.
- `src/lib/folder-annotations.ts` references to `<tenant-app-web>` and `<tenant-app-api>` are unrelated leaves (web/api), not the dashboard — not flagged.

### Human Verification Required

None blocking. Optional sanity check: open `http://localhost:3000/` in a browser and confirm sign-in flow renders identically to the standalone repo's pre-move state. Automated probes already confirm 200/307 on the three sampled routes.

### Gaps Summary

**One non-functional doc gap.** The migration is operationally complete — workspace works, builds clean, dev server serves all routes, paths resolve correctly, env carries forward, standalone repo preserved for rollback. The only blocker against a clean "passed" status is `apps/dashboard/README.md` lines 96-99, which still tell a reader to follow `.bbc-leaf/README.md` (deleted) at the standalone-repo relative path `../bbc/distribution/dashboard/CLAUDE.md`. From the new monorepo location the correct path is `../../distribution/dashboard/CLAUDE.md`, and the `.bbc-leaf` indirection is no longer needed (a sibling of `apps/` is the leaf itself). Fix is a 4-line README edit.

---

## Part B — Tenant model SQL migration + auth generalization

**Verified:** 2026-05-08
**Status:** gaps_found (functional claims pass; documentation still narrates the old allowlist gate; live-DB shape not directly probed in this session)
**Re-verification:** No — initial verification of Part B.

### Verification environment caveat

The prompt directed me to use `mcp__supabase__list_tables` and `execute_sql` against project `gpmtkhyczbapnfquhswn` to probe live schema, triggers, RLS, and migration data (claims #1, #2, #3, #4, #5 in the prompt). **Those tools are not exposed to this verifier session.** I verified the schema indirectly via three signals that would all fail if the live DB diverged from the migrations on disk:

1. **Source migrations** at `apps/dashboard/supabase/migrations/0003_tenant_model.sql` and `0004_migrate_allowlist_to_tenant_invitations.sql` match every claim in the prompt line-by-line.
2. **Regenerated types** (`apps/dashboard/src/lib/supabase/database.types.ts`) — emitted from the live DB by Supabase's type generator — contain exactly the new tables (`tenants`, `tenant_members`, `tenant_invitations`), the `tenant_role` enum (admin/member/viewer), and the `auth_tenant` + `is_member_of` functions; `allowlist` is absent.
3. **`pnpm type-check` and `pnpm build` are green** with the new types; the dev server at port 3000 returns 307 on `/` and 200 on `/auth/signin`.

If the migrations had not been applied, the type generator would not have emitted these types and the dashboard's new `requireActor` join (which queries `tenant_members` + `tenants`) would fail to type-check. So the migrations are almost certainly applied — but the human verification entries below queue up the direct SQL probes for confirmation.

### Observable Truths

| #   | Truth                                                                                                          | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | New schema (tenants, tenant_members, tenant_invitations, tenant_role enum) exists with the documented shape    | INFERRED   | Migration `0003` defines all four (with the exact slug regex `^[a-z][a-z0-9-]{2,62}$`, composite PK on `(tenant_id, user_id)`, role enum `('admin','member','viewer')`). Migration `0004` adds `tenant_invitations` with `unique (tenant_id, provider, identifier)`. `database.types.ts` lines 53-146 emit exactly these shapes from the live DB. **Direct DB probe deferred to human verification.**                                                       |
| 2   | The old `public.allowlist` table is dropped                                                                    | INFERRED   | `0004` line 153: `drop table if exists public.allowlist;`. `database.types.ts` does not emit an `allowlist` table type. **Direct DB probe deferred.**                                                                                                                                                                                                                                                                                                       |
| 3   | `profiles.tenant_id` is NOT NULL with FK to tenants                                                            | INFERRED   | `0004` lines 27 (add column nullable), 30-51 (backfill), 54 (`alter column tenant_id set not null`). `database.types.ts` line 22 declares `tenant_id: string` (non-nullable Row type, with FK relationship at line 44-50 referencing `tenants`).                                                                                                                                                                                                            |
| 4   | `auth_tenant()` and `is_member_of(uuid)` functions exist with the right security models                        | INFERRED   | `0003` lines 36-48 define `is_member_of` as `security definer` with `revoke execute ... from public, anon, authenticated`; lines 54-66 define `auth_tenant` as `security invoker` (intentional — invoker-style allows safe call from RLS policies). `database.types.ts` lines 150-151 emit both function signatures.                                                                                                                                        |
| 5   | Trigger swap on `auth.users` is complete (old gone, new in place)                                              | INFERRED   | `0004` lines 139-148: `drop trigger if exists check_allowlist_before_insert`, `drop trigger if exists create_profile_after_insert`, then creates `check_invitation_before_insert` (BEFORE INSERT) + `create_profile_and_membership_after_insert` (AFTER INSERT). Lines 151-152 drop the old functions `check_allowlist()` and `create_profile_for_user()`. New functions are `security definer` with `set search_path = public, auth` (lines 60-61, 92-93). |
| 6   | RLS rewrites land (tenants/tenant_members/tenant_invitations gated; profiles policy keys on auth_tenant())     | INFERRED   | `0003` defines `tenants_member_read` (uses `is_member_of(id)`) and `tenant_members_self_read` (`user_id = auth.uid() or is_member_of(tenant_id)` — note: relies on `is_member_of` being `security definer` to break recursion). `0004` line 23 defines `tenant_invitations_member_read` and lines 156-158 drop `profiles_self_read` + create `profiles_self_in_tenant_read` keyed on `auth_tenant()`.                                                       |
| 7   | App code (`requireActor` + `requireRole`) populates tenant context and gates Accept/Reject at >= 'member'      | VERIFIED   | `apps/dashboard/src/lib/auth/require-user.ts` lines 5-16 declare `Actor` with `tenant_id`, `tenant_slug`, `role`. Lines 42-86 join `profiles` → `tenant_members` → `tenants(slug)` and populate. Lines 93-102 implement `requireRole` with rank `viewer:0 < member:1 < admin:2`. `apps/dashboard/src/app/queue/actions.ts` lines 36-39 and 67-70 call `requireActor()` then `requireRole(a.actor, 'member')` before both `acceptProposal` and `rejectProposal`. |
| 8   | Build is green and dev server still serves all expected routes                                                 | VERIFIED   | `pnpm type-check` exits clean. `pnpm build` reports "Compiled successfully" with all 10 routes (`/`, `/auth/{callback,signin,signout}`, `/bindings`, `/graph`, `/log`, `/queue`, `/queue/[id]`, `/skills`). Live probes: `/`=307, `/auth/signin`=200.                                                                                                                                                                                                          |

**Score:** 6/8 truths verified or strongly inferred. **Truths 1–6 are INFERRED, not directly probed against the live DB** — see "Verification environment caveat" above. Truths 7-8 verified directly.

### Required Artifacts

| Artifact                                                                                | Expected                                                       | Status   | Details                                                                                                                              |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/dashboard/supabase/migrations/0003_tenant_model.sql`                              | tenants + members + role enum + helpers + RLS                  | VERIFIED | 78 lines; matches every claim. Slug regex includes the documented length bound.                                                       |
| `apps/dashboard/supabase/migrations/0004_migrate_allowlist_to_tenant_invitations.sql`   | invitations table, profiles.tenant_id, trigger swap, drops old | VERIFIED | 159 lines; bootstraps `zeths-bbc` tenant for `zethtang@gmail.com`, copies allowlist rows in as admin invitations, then drops allowlist. |
| `apps/dashboard/src/lib/supabase/database.types.ts`                                     | regenerated types reflect new schema                           | VERIFIED | Tenants, tenant_members, tenant_invitations, tenant_role enum, auth_tenant + is_member_of all present. `allowlist` absent.            |
| `apps/dashboard/src/lib/auth/require-user.ts`                                           | Actor with tenant_id/slug/role; requireActor; requireRole      | VERIFIED | All three present and exported. Tenant-resolution comment block accurately notes Phase 1 = first-joined tenant; Phase 6+ extension.   |
| `apps/dashboard/src/app/queue/actions.ts`                                               | role-gated Accept/Reject                                       | VERIFIED | Both actions call `requireRole(a.actor, 'member')` immediately after `requireActor()`.                                                 |

### Key Link Verification

| From                                                  | To                                            | Via                                              | Status     | Details                                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `auth.users` BEFORE INSERT                            | `tenant_invitations` lookup                   | `check_invitation()` SECURITY DEFINER            | INFERRED   | Function checks `(provider, identifier)` against `tenant_invitations` and raises `not_invited`/P0001 if absent. Replaces `check_allowlist`. |
| `auth.users` AFTER INSERT                             | `profiles` + `tenant_members`                 | `create_profile_and_membership()` SECURITY DEFINER | INFERRED   | Inserts profile with `tenant_id` from invitation, then membership row with `role` from invitation.                                |
| `requireActor()` → `requireRole()` → server action    | `tenant_members.role` value                   | column read in profile/membership join          | WIRED      | `actions.ts` lines 36-39, 67-70 gate both Accept and Reject at >= 'member'. Viewer gets `forbidden: this action requires member; you are viewer`. |
| `tenant_members` RLS policy                           | `tenant_members` table                        | `is_member_of(tenant_id)`                        | WIRED      | The function is `security definer`, so the inner `select 1 from public.tenant_members ...` bypasses the same RLS policy and avoids infinite recursion. **Live recursion smoke deferred to human verification.** |
| `profiles_self_in_tenant_read` policy                 | `auth_tenant()`                               | `tenant_id = public.auth_tenant()`               | WIRED      | `auth_tenant()` is `security invoker` (intentional for use inside RLS); returns the user's first-joined tenant.                    |

### Anti-Patterns Found

| File                                                          | Lines        | Pattern                                                      | Severity | Impact                                                                                                                                                                                            |
| ------------------------------------------------------------- | ------------ | ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/dashboard/README.md`                                    | 3, 36, 49, 55, 58, 67 | Stale "allowlist" narrative + runnable SQL pointing at dropped table | Warning  | Contains `insert into public.allowlist(provider, identifier) values ...` as setup instructions. A new self-host operator following the README will hit `relation does not exist` on first seed. |
| `distribution/dashboard/CLAUDE.md`                            | 66, 68, 69, 81 | "every signed-in user has full Accept/Reject power" + "No per-user RBAC" | Warning  | Both statements are now factually wrong: viewers cannot Accept/Reject because of `requireRole(actor, 'member')`. Leaves the leaf-doc out of sync with the code's security posture.            |
| `apps/dashboard/src/app/auth/signin/SignInForm.tsx`           | 119          | User-facing string still says "allowlist"                    | Info     | "You're not on the allowlist for this dashboard. Ask the admin to add you." — wording references a table that no longer exists, but the user-visible behavior is correct.                       |
| `apps/dashboard/src/app/auth/signin/page.tsx`                 | 14, 63       | Same user-facing "allowlist" wording                         | Info     | Same as above.                                                                                                                                                                                    |

No TODO/FIXME/PLACEHOLDER stubs introduced in source. No empty handlers. No `return null` placeholders. All new functions implemented; trigger functions return `new` correctly.

### Out-of-scope confirmations (not flagged as gaps)

- Tenant-management UI (invite by email, change role, remove member) is **Phase 5** — not flagged.
- Cross-tenant RLS leakage cannot be exercised end-to-end with only one tenant — flagged as human verification, not as a gap.
- `bbc/memory/tech/repo-structure.md` mentions of "allowlist" in historical migration narration are not live runtime references — not flagged.
- The `Hard constraint: invite-only hosting` block in `distribution/dashboard/CLAUDE.md` correctly identifies `child_process.exec` as the soft underbelly; that surface is unchanged in Part B (Phase 2/3 work).

### Human Verification Required

See `human_verification:` block in frontmatter. Two items:
1. Direct SQL probes against project `gpmtkhyczbapnfquhswn` to confirm migration data + drops + triggers (zero-row checks for `allowlist`, `check_allowlist`, `create_profile_for_user`; one-row check on `tenants`; two-row check on `tenant_invitations`; recursion-safe SELECT on `tenant_members` as authenticated).
2. Live signup smoke test for the three E2E scenarios (`random-not-invited`, `newteamuser`, `phase1test`).

### Gaps Summary

**Two real gaps, one verification gap.**

**Gap B-1 (failed): Documentation lag.** The schema migrated, the auth code rewired, but the prose layer didn't move with them. `apps/dashboard/README.md` still tells operators to `insert into public.allowlist(...)` (table dropped). `bbc/distribution/dashboard/CLAUDE.md` still claims "every signed-in user has full Accept/Reject power" and "No per-user RBAC" — both wrong now that `requireRole` enforces `viewer < member < admin` on Accept/Reject. User-facing error copy in the signin flow leaks the obsolete table name. Pure-doc fix; doesn't block runtime, but actively misleads.

**Gap B-2 (uncertain): Live-DB schema state was not probed in this session.** The verifier was instructed to use `mcp__supabase__list_tables` / `execute_sql` but those tools are not available here. Three indirect signals (source migrations, regenerated types, green build) all align with the prompt's claims, but the direct SQL evidence is queued in human-verification rather than reported as VERIFIED.

**Carry-over from Part A (partial): apps/dashboard/README.md lines 96-99** still reference the deleted `.bbc-leaf/` directory and use a standalone-repo-relative path. Unchanged since the Part A verification.

**No functional regression detected.** Part B's app-code claims (Actor type extension, requireActor join, requireRole hierarchy, role gate on actions.ts) all verify directly. Type-check and build remain green.

---

_Verified: 2026-05-08_
_Verifier: Claude (gsd-verifier, Opus 4.7 1M)_
