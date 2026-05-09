---
phase: F1-tenant-model
verified: 2026-05-08T00:00:00Z
status: gaps_found
score: 5/6 must-haves verified
parts:
  - part: A
    status: gaps_found
    score: 5/6
gaps:
  - truth: "No stale path/leaf references remain in updated docs after the move"
    status: partial
    reason: "apps/dashboard/README.md still references `.bbc-leaf/README.md` and `../bbc/distribution/dashboard/CLAUDE.md` (both stale: .bbc-leaf was removed, and the relative path is from standalone-repo days; from the monorepo location the leaf lives at `../../distribution/dashboard/CLAUDE.md`)."
    artifacts:
      - path: "apps/dashboard/README.md"
        issue: "Line 96-99: 'See `.bbc-leaf/README.md` for the back-pointer convention.' refers to a directory removed during the move; the `Connection to BBC` block points at `../bbc/distribution/dashboard/CLAUDE.md` which is the standalone-repo path."
    missing:
      - "Update apps/dashboard/README.md `Connection to BBC` section to drop the `.bbc-leaf` back-pointer convention (no longer applicable in monorepo) and fix the path to `../../distribution/dashboard/CLAUDE.md`."
---

# Phase F1: Tenant Model + Auth Generalization — Verification Report

**Phase Goal:** Move 8azi-dashboard into the BBC monorepo as `apps/dashboard/` (Part A), then add tenant-scoped auth/data (Part B). Sets the foundation for multi-tenant SaaS hosting.

**Plan reference:** `/Users/grid/.claude/plans/i-need-you-to-merry-teacup.md` § "Phase 1 — Tenant model + auth generalization"; sub-plan in `bbc/memory/tech/repo-structure.md` § "Migration plan".

---

## Part A — Monorepo migration (8azi-dashboard → apps/dashboard/)

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
| 5   | The standalone repo at /Users/grid/Documents/GitHub/8azi-dashboard is preserved as a rollback safety | VERIFIED   | `ls /Users/grid/Documents/GitHub/8azi-dashboard/` returns the original tree (`src`, `supabase`, `package.json`, `package-lock.json`, `tsconfig.json`, etc.).                                                            |
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
| `/Users/grid/Documents/GitHub/8azi-dashboard/` | standalone repo preserved (rollback)                | VERIFIED   | Tree intact.                                                                                  |
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
- Archiving the `ZethT/8azi-dashboard` GitHub repo is a manual step the user owns — not flagged.
- `bbc/memory/tech/repo-structure.md` and `.planning/phases/D*/SUMMARY.md` mentions of `8azi-dashboard` are historical migration documentation, not live path references — not flagged.
- `src/lib/folder-annotations.ts` references to `8azi-web` and `8azi-api` are unrelated leaves (web/api), not the dashboard — not flagged.

### Human Verification Required

None blocking. Optional sanity check: open `http://localhost:3000/` in a browser and confirm sign-in flow renders identically to the standalone repo's pre-move state. Automated probes already confirm 200/307 on the three sampled routes.

### Gaps Summary

**One non-functional doc gap.** The migration is operationally complete — workspace works, builds clean, dev server serves all routes, paths resolve correctly, env carries forward, standalone repo preserved for rollback. The only blocker against a clean "passed" status is `apps/dashboard/README.md` lines 96-99, which still tell a reader to follow `.bbc-leaf/README.md` (deleted) at the standalone-repo relative path `../bbc/distribution/dashboard/CLAUDE.md`. From the new monorepo location the correct path is `../../distribution/dashboard/CLAUDE.md`, and the `.bbc-leaf` indirection is no longer needed (a sibling of `apps/` is the leaf itself). Fix is a 4-line README edit.

---

## Part B — Tenant model SQL migration

_Not yet started. To be appended in a follow-up verification once the tenant-scoped schema, RLS policies, and multi-tenant auth generalization land._

---

_Verified: 2026-05-08_
_Verifier: Claude (gsd-verifier, Opus 4.7 1M)_
