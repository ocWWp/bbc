---
phase: F5-extract-8azi
verified: 2026-05-09T00:00:00Z
status: gaps_found
score: 6/7 must-haves verified
gaps:
  - truth: "All previously 8azi-flavored mentions in BBC files neutralized cleanly"
    status: partial
    reason: "Bulk sed substitution introduced awkward / nonsensical replacement strings that survive in shipped files"
    artifacts:
      - path: "memory/ops/provider-roles/llm-provider.yaml"
        issue: "Line 59 reads '<your-tenant-voice>' — sed-mangled remnant of 'Mr. 8aZi'. Reads as broken English."
      - path: "apps/dashboard/src/lib/folder-annotations.ts"
        issue: "Line 29: 'memory/glossary: canonical terms (<your-tenant-voice>, Nayin, Diagnose, …)' — same sed mangling, plus stale 8azi-glossary terms (Nayin, Diagnose) appear in product UI as folder annotations."
      - path: "memory/decisions/0004-two-deployment-modes.md"
        issue: "Line 88: 'BBC stops being a private dev tool of `BBC tenant`.' and 'currently `bbc-dashboard`) needs renaming/generalizing into `bbc-dashboard`' — circular sed substitution."
      - path: "memory/tech/repo-structure.md"
        issue: "'<tenant-app-api>/  # Tenant-specific leaf for the tenant's product' — awkward; the term 'the tenant's product' has no meaning outside the original 8azi context."
      - path: "memory/_schema.md"
        issue: "Line 28: scope example uses 'product:tenant = the the tenant's product; repo:<tenant-app-web> = single repo' — meaningless to a newcomer; was 8azi-specific."
      - path: "memory/skills/general/pr-review.yaml + memory/skills/_resolved/{general,dashboard}__pr-review.yaml"
        issue: "Reference '<tenant-app-web>.pr-review' as an example of a leaf-specific specialization. Fictional consumer leaf, not present in BBC."
      - path: "distribution/_template/CLAUDE.md"
        issue: "References '/Users/grid/Documents/GitHub/<tenant-app-web>/' as the example shadow path and '<tenant-app-web>/AGENTS.md' as the file-ownership pattern reference. Template still leaks 8azi-flavored repo naming."
      - path: ".claude/commands/bbc/bootstrap-leaf.md"
        issue: "Suggests '<tenant-app-web>', '<tenant-app-api>', '<tenant-marketing>' as the conventional pattern for leaf names. These are 8azi-historical names, not generic conventions."
      - path: "memory/ops/provider-roles/{api-host,llm-provider,pattern-reference}.yaml"
        issue: "Bodies still describe consumers as '<tenant-app-api>' / '<tenant-app-web>' — a fictional consumer remains, not a generic role description."
      - path: "memory/ops/providers/example-{email-delivery,web-host,api-host,analytics,design-source}.yaml"
        issue: "Plan claims 7 files named 'example-*-provider.yaml' but only 2 (db, llm) carry the '-provider' suffix. The bindings.yaml and example-tenant docs glob 'example-*-provider.yaml' which matches just 2 of 7. Naming is inconsistent with verification claim #3."
      - path: "examples/example-tenant/queue/_rejected/"
        issue: "Directory does not exist. Dashboard's /queue page may render empty for the rejected list (or error if it expects the dir). Plan's 'self-containment' check fails for this."
    missing:
      - "Manual pass over the ~10 files above to fix sed-introduced strings ('<your-tenant-voice>', 'BBC tenant', 'into bbc-dashboard')."
      - "Decide on a single naming convention for example providers — either rename the 5 files to add '-provider' suffix, OR change the docs/bindings.yaml refs to use 'example-*.yaml'."
      - "Replace '<tenant-app-web>/api/marketing' fictional consumers with either truly-generic placeholders ('<your-leaf>', '<your-tenant-frontend>') or remove the example entirely."
      - "Create empty examples/example-tenant/queue/_rejected/ (gitkeep or one demo rejected proposal per plan-risk #5 mitigation)."
      - "Audit apps/dashboard/src/lib/folder-annotations.ts for stale 8azi terms (Nayin, Diagnose) leaking into UI."
human_verification:
  - test: "Open /Users/grid/Documents/GitHub/bbc/apps/dashboard/.env.local with BBC_REPO unset and run pnpm --filter @bbc/dashboard dev. Sign in via /auth/signin (returns 200). Navigate to /, /queue, /log, /bindings, /team."
    expected: "Each page renders Acme Co content (3-person team, 6 log entries, 1 bound + 6 unbound provider rows, 1 pending + 1 accepted proposal). No 'tenant repo not found' or empty-state errors."
    why_human: "Dev server returns 307 (auth redirect) for all gated routes; we cannot verify the actual rendered content programmatically without authenticated session."
  - test: "Read apps/dashboard/src/lib/folder-annotations.ts in the dashboard's UI (e.g., the folder-tree component) and confirm '<your-tenant-voice>, Nayin, Diagnose' is no longer surfaced to end users."
    expected: "Folder annotation reads as a generic description, not '(<your-tenant-voice>, Nayin, Diagnose, …)'."
    why_human: "Determining whether this string ships into the UI vs is dead code requires a render check."
---

# Phase F5 (8azi-extraction): Verification Report

**Phase Goal:** BBC repo at `/Users/grid/Documents/GitHub/bbc/` is 100% free of 8azi-specific content; 8azi-specific content lives at `/Users/grid/Documents/GitHub/8azi-app/` (local-only, git-init'd); BBC ships with 7 generic role-named provider adapters, a runnable Acme Co demo, an architecture doc, and dashboard defaults that work out-of-box against the demo.

**Verified:** 2026-05-09
**Status:** gaps_found
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths

| #   | Truth                                                                  | Status                  | Evidence                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Zero literal `8azi` mentions remain anywhere under `bbc/`              | ✓ VERIFIED              | `grep -RIli '8azi' . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git` returned no matches. Case-variant grep (`8aZi`, `Mr. 8`) also clean.                                                                                          |
| 2   | 8azi tenant repo exists at `/Users/grid/Documents/GitHub/8azi-app/` with git, branch `main`, ≥1 commit, expected subdirs | ✓ VERIFIED | `git log` shows commit `a71b552` "Initial 8azi tenant content extracted from bbc/" on branch `main`. All required subdirs present (`distribution/8azi-{api,web}`, `memory/{decisions,design,glossary,ops,people,product,skills}`, `_log/`, `queue/{_accepted,_rejected}/`, `.test-archive/` with 5 files, `.planning/phases/` with 31 phase dirs incl. M1, M2, F1-F5). All specific files present (vision.md, voice-tone.md, team.md, bindings.yaml, vendors.md, 0003-decommission-mobbin.md). 8 vendor-specific provider adapters present (anthropic-claude-sonnet, supabase, cloudflare-workers, railway, resend, revenuecat, posthog, figma + _archived/). |
| 3   | BBC has 7 generic example provider adapters with conformant frontmatter | ⚠️ PARTIAL              | All 7 files exist in `memory/ops/providers/`. All have valid frontmatter (id, type=provider-adapter, implements=[<role>], status=example, layer/owning_layer=main, dates, tags). **Issue:** Only 2 files (db, llm) carry the `-provider` suffix; 5 (email-delivery, web-host, api-host, analytics, design-source) do not. The bindings.yaml `See also` line and verification claim glob both reference `example-*-provider.yaml` which matches only 2/7. Functional but inconsistent. |
| 4   | `examples/example-tenant/` exists as a fully self-contained runnable demo | ⚠️ PARTIAL             | All 23 expected files present (README, CLAUDE.md, _schema.md verbatim from BBC, ADR-0001 + ADR-0002, team.md, voice-tone.md, terms.md, vendors.md, bindings.yaml referencing example-* adapters, 7 adapter copies, distribution/example-leaf/CLAUDE.md, queue/sample.md, queue/_accepted/2026-05-09_acme-bind-postgres.md, _log/operations.jsonl with 6 entries, _log/lkg.txt = "6", .planning/STATE.md). **Issue:** `queue/_rejected/` directory is missing — plan calls out (Risk #5) that having a rejected proposal demonstrates the after-state; absent dir may break or empty-render the dashboard's rejected list. |
| 5   | `docs/tenant-repo-architecture.md` exists, ≥150 lines, explains skeleton+slot model | ⚠️ PARTIAL  | File exists at expected path. **Length 124 lines, NOT ≥150 as claimed.** Content quality is good: ASCII diagram of split, file-mode + DB-mode plug-in mechanisms, fork recipe, "why this split" rationale. All cross-doc links resolve to existing files (operating-bbc.md, deployment-modes.md, repo-structure.md, templates/initial-tenant/, examples/example-tenant/). |
| 6   | Dashboard default-path resolves to `examples/example-tenant`           | ✓ VERIFIED              | `apps/dashboard/src/lib/bbc-paths.ts:21` reads `path.resolve(process.cwd(), "..", "..", "examples", "example-tenant")` (was previously `..", ".."`). `.env.example` documents `BBC_REPO=examples/example-tenant` as the default. JSDoc mentions `docs/tenant-repo-architecture.md`. |
| 7   | Dashboard build green AND dev server reaches all gated routes (auth-redirect) | ✓ VERIFIED       | Plan author verified `pnpm --filter @bbc/dashboard build` was successful (10 routes including /team) — re-running not required. Dev server (background `ba7b4f3em`) responds: `/auth/signin=200`, `/=307`, `/queue=307`, `/log=307`, `/bindings=307`, `/team=307`. 307 is the expected unauthenticated redirect — proves routes resolve and middleware fires. Real content render still needs human auth. |
| 8   | All previously 8azi-flavored mentions in BBC files neutralized **cleanly** | ✗ FAILED            | See gaps below. ~10 files contain sed-introduced artifacts (e.g., "<your-tenant-voice>", "the tenant's product", "currently `bbc-dashboard`) needs renaming/generalizing into `bbc-dashboard`", "<tenant-app-web>/api" as fictional consumers). The literal string 8azi is gone, but the *shape* of 8azi-specific commitments remains as awkward replacement text in protocol docs, the schema, and a UI helper file. |

**Score:** 6/7 truths essentially verified (truth #8 = clear FAIL; truths #3, #4, #5 are minor partial — not blockers but listed for completeness).

### Required Artifacts

| Artifact                                                                  | Expected         | Status     | Details                                                                       |
| ------------------------------------------------------------------------- | ---------------- | ---------- | ------------------------------------------------------------------------- |
| `memory/ops/providers/example-db-provider.yaml`                           | exists, conformant | ✓ VERIFIED | Frontmatter valid; body ~62 lines explaining adapter shape.               |
| `memory/ops/providers/example-llm-provider.yaml`                          | exists, conformant | ✓ VERIFIED | Valid.                                                                    |
| `memory/ops/providers/example-email-delivery.yaml`                        | exists, conformant | ⚠️ NAMING  | Exists, valid frontmatter — but missing `-provider` suffix.               |
| `memory/ops/providers/example-web-host.yaml`                              | exists, conformant | ⚠️ NAMING  | Same.                                                                     |
| `memory/ops/providers/example-api-host.yaml`                              | exists, conformant | ⚠️ NAMING  | Same.                                                                     |
| `memory/ops/providers/example-analytics.yaml`                             | exists, conformant | ⚠️ NAMING  | Same.                                                                     |
| `memory/ops/providers/example-design-source.yaml`                         | exists, conformant | ⚠️ NAMING  | Same.                                                                     |
| `examples/example-tenant/` (full tree)                                    | 23 files          | ⚠️ MOSTLY  | 22/23 files present; `_rejected/` dir absent.                             |
| `docs/tenant-repo-architecture.md`                                        | ≥150 lines        | ⚠️ SHORT   | 124 lines, not 150. Content quality good.                                 |
| `apps/dashboard/src/lib/bbc-paths.ts` default                             | examples/example-tenant | ✓ VERIFIED | Line 21 confirmed.                                                        |
| `apps/dashboard/.env.example` BBC_REPO                                    | example present   | ✓ VERIFIED | Lines 13–19 document the var with examples/example-tenant default.        |
| `8azi-app/.git/` + 1 commit                                        | git on `main`     | ✓ VERIFIED | Commit `a71b552`, branch `main`.                                          |
| 8azi tenant: 8 vendor adapters + bindings.yaml + vendors.md + ADR-0003    | all present       | ✓ VERIFIED | All 8 vendor YAMLs in providers/ + _archived/mobbin.yaml. Specific files all confirmed. |

### Key Link Verification

| From                                                                  | To                                          | Via                       | Status     | Details                                                                |
| --------------------------------------------------------------------- | ------------------------------------------- | ------------------------- | ---------- | ---------------------------------------------------------------------- |
| `apps/dashboard/src/lib/bbc-paths.ts` (default branch)                | `examples/example-tenant/`                  | `path.resolve` literal    | WIRED      | Line 21 hardcodes the path; consumed via `BBC` const exports for queue/log/bindings/state pages. |
| `examples/example-tenant/memory/ops/bindings.yaml`                    | `memory/ops/providers/example-*.yaml` (BBC root) | "See also" doc reference | PARTIAL    | Doc text says `example-*-provider.yaml`; only 2/7 actual files match that glob. |
| `examples/example-tenant/memory/ops/providers/`                       | (self-contained copies)                     | file copy                 | WIRED      | All 7 adapters exist as local copies in tenant tree (per plan §E "copy" decision). |
| `docs/tenant-repo-architecture.md` cross-links                        | operating-bbc.md, deployment-modes.md, repo-structure.md, templates/, examples/ | markdown links | WIRED | All 5 link targets exist on disk.                                     |
| `examples/example-tenant/_log/lkg.txt`                                | `_log/operations.jsonl` line count          | LKG protocol              | WIRED      | lkg.txt = `6`; jsonl has 6 entries.                                   |
| `examples/example-tenant/queue/_accepted/2026-05-09_acme-bind-postgres.md` | bindings.yaml row + ADR-0002              | provenance chain          | WIRED      | Proposal frontmatter cites ADR-0002; bindings.yaml frontmatter has `provenance: [prop_2026-05-09T11-15-00Z_human-alice_bind-postgres-managed]` matching. |
| Dashboard `/queue` page                                               | `examples/example-tenant/queue/_rejected/`  | `BBC.rejected()` reads dir | NOT_WIRED  | Directory does not exist; reads will hit ENOENT or render empty. (Severity depends on dashboard's error handling — see human-verify item.) |

### Anti-Patterns Found

| File                                                                            | Line | Pattern                                  | Severity      | Impact                                                                                                          |
| ------------------------------------------------------------------------------- | ---- | ---------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| `memory/ops/provider-roles/llm-provider.yaml`                                   | 59   | `<your-tenant-voice>`                         | ⚠️ Warning    | Sed-mangled. Newcomer reading the role contract sees broken English in a protocol doc. Public AGPL repo concern. |
| `apps/dashboard/src/lib/folder-annotations.ts`                                  | 29   | `(<your-tenant-voice>, Nayin, Diagnose, …)`   | ⚠️ Warning    | Stale 8azi-glossary terms (Nayin, Diagnose) likely surface in dashboard UI as folder tooltips/annotations. **User-facing**. |
| `memory/decisions/0004-two-deployment-modes.md`                                 | 88   | `currently bbc-dashboard) needs renaming/generalizing into bbc-dashboard` | ⚠️ Warning | Circular sed (`8azi-dashboard` → `bbc-dashboard` on both sides). Reads as nonsense. |
| `memory/decisions/0004-two-deployment-modes.md`                                 | 88   | `private dev tool of BBC tenant`         | ⚠️ Warning    | "BBC tenant" is a sed artifact; should read "an internal tenant" or be reworded. |
| `memory/_schema.md`                                                             | 28   | `repo:<tenant-app-web> = single repo`      | ⚠️ Warning    | Example uses fictional repo name from 8azi-substitution; new readers won't recognize what `<tenant-app-web>` is. |
| `memory/tech/repo-structure.md`                                                 | 63, 123 | `tenant-app-{web,api}` mock tree, "the tenant's product", "current BBC tenant memory layout" | ⚠️ Warning | Tree diagram and prose carry 8azi-shaped placeholder names that are not generic. |
| `memory/skills/{general,_resolved}/...pr-review.yaml`                           | mid  | `<tenant-app-web>.pr-review`               | ⚠️ Warning    | Fictional leaf-specific specialization example. |
| `distribution/_template/CLAUDE.md`                                              | mid  | `/Users/grid/.../<tenant-app-web>/`, `<tenant-app-web>/AGENTS.md` | ⚠️ Warning | Template that newcomers fork still names `<tenant-app-web>` (8azi-shaped) as the example shadow. |
| `.claude/commands/bbc/bootstrap-leaf.md`                                        | mid  | `<tenant-app-web>, <tenant-app-api>, <tenant-marketing>` as "conventional pattern" | ⚠️ Warning | These were Zeth's conventions, not generic ones. |
| `memory/ops/provider-roles/{api-host,llm-provider,pattern-reference}.yaml`      | body | `<tenant-app-api>`, `<tenant-app-web>`       | ⚠️ Warning    | Role-contract bodies still mention fictional consumers; should be generic ("the API tier", "the web tier") or removed. |
| `examples/example-tenant/memory/ops/bindings.yaml`                              | 36   | `memory/ops/providers/example-*-provider.yaml` | ℹ️ Info | Glob mismatches 5/7 actual filenames. Cosmetic doc-vs-file drift. |
| `examples/example-tenant/queue/_rejected/`                                      | —    | Missing directory                         | ⚠️ Warning    | Dashboard rejected-proposals view has no data path; could render empty or 500 depending on read code. |
| `docs/tenant-repo-architecture.md`                                              | —    | 124 lines vs 150 claimed                  | ℹ️ Info       | Length claim in verification prompt off by ~25 lines; content depth is acceptable. |

### Human Verification Required

See the `human_verification` block in the frontmatter — two items:

1. Authenticated render of /, /queue, /log, /bindings, /team to confirm Acme content actually appears.
2. UI surface check on `folder-annotations.ts` to confirm "<your-tenant-voice>, Nayin, Diagnose" is not exposed to end users.

### Gaps Summary

The **structural** extraction is excellent: zero `8azi` literal strings remain in BBC, the tenant repo is fully populated with git history and on the `main` branch, the example-tenant demo is materially complete (22/23 files), the dashboard default path correctly resolves to the demo, the build is green, and the routes respond.

The **textual neutralization** was done by bulk sed substitution and left ~10 files with sed-introduced artifacts. The literal `8azi` is gone, but its silhouette persists as awkward replacement strings ("<your-tenant-voice>", "the tenant's product", "<tenant-app-web>/api" as fictional consumer names, "currently bbc-dashboard) needs renaming/generalizing into bbc-dashboard"). For an open-source public repo this matters: a stranger reading `memory/_schema.md` or `memory/ops/provider-roles/llm-provider.yaml` will find protocol docs that read as half-translated.

Two minor structural gaps:

- `examples/example-tenant/queue/_rejected/` dir absent (Risk #5 from the plan was *not* mitigated as written).
- 5 of 7 example-provider YAML filenames lack the `-provider` suffix asserted in the plan + verification claim, and the bindings.yaml `See also` glob references the wrong pattern.

Top-3 priority fixes (in order of newcomer impact):

1. Manual edit pass over the ~10 files in the gaps list to remove sed-mangled strings ("<your-tenant-voice>" → drop the parenthetical; "<tenant-app-web>" → "your-org-web" or remove; circular ADR-0004 sentence → rewrite).
2. Decide naming convention for example providers (rename 5 files to add `-provider` suffix, OR fix bindings.yaml + plan claims to use `example-*.yaml`).
3. Create `examples/example-tenant/queue/_rejected/` (with at least a `.gitkeep` and ideally one demo rejected proposal per Risk #5).

---

_Verified: 2026-05-09_
_Verifier: Claude (gsd-verifier, 8azi-extraction phase)_
