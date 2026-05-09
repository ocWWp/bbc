---
phase: F0-productization-foundation
verified: 2026-05-08T00:00:00Z
status: gaps_found
score: 5/8 must-haves verified
gaps:
  - truth: "bbc/CLAUDE.md lock matrix is updated to govern DB-mode tables"
    status: failed
    reason: "ADR-0004 §Consequences explicitly says 'A new lock-matrix row governs DB-mode tables: rows where owning_layer: main are mutable only via accept_proposal() / reject_proposal() SQL transactions...'. The ADR commits to this row. The CLAUDE.md edit (still uncommitted in working tree) updated principle 1 only — the lock matrix table is unchanged. Worse: CLAUDE.md's own §What changes this file says 'Update the lock matrix and the precedence rule together if either changes' — and a principle 1 evolution that introduces a brand-new storage substrate (DB tables) without a matching lock-matrix row is precisely the silent-bump that clause forbids."
    artifacts:
      - path: "CLAUDE.md"
        issue: "Lock matrix unchanged. Missing row(s) for: memory_files where owning_layer=main, queue_items, proposals_accepted/rejected, operations_log. Also no row clarifying who can mutate DB rows in DB-mode (RLS + accept_proposal() function vs current bash script columns)."
    missing:
      - "Add row(s) to bbc/CLAUDE.md lock matrix covering DB-mode tables: memory_files (owning_layer:main), memory_files (owning_layer:manager), memory_files (owning_layer:distribution), queue_items, proposals_accepted, proposals_rejected, operations_log, bindings."
      - "Specify the 'Who can edit directly' column in DB-mode language: e.g., 'authenticated Main-role session via accept_proposal()/reject_proposal() SQL functions' for owning_layer:main rows."
      - "Specify the 'Who can propose edits' column: e.g., 'Manager and Distribution sessions via proposeChange() SQL function (DB-mode) or scripts/propose.sh (file-mode)'."
      - "Add a row for queue_items review annotations (the manager_review/cross_leaf_impact/promotion_check blocks) — file-mode currently lets Manager append directly per ADR-0002; DB-mode equivalent (jsonb columns? separate table? RLS that lets manager-role UPDATE only those columns?) is unspecified."

  - truth: "Principle evolution genuinely engages with the hard parts (no silent autonomy under DB-mode)"
    status: partial
    reason: "ADR-0004 §Consequences/Governance and tech/deployment-modes.md §Invariant translation both repeat the principle but only lightly engage with the actual erosion vector. DB-mode introduces Postgres triggers (acknowledged) and per-tenant API keys for MCP (acknowledged). It does NOT acknowledge: (a) Supabase webhooks, (b) scheduled functions / pg_cron, (c) realtime subscriptions firing UI side-effects, (d) MCP server's ability to make multi-step changes inside one tool call (an MCP call could acceptProposal + proposeChange + acceptProposal in a loop, which is observably indistinguishable from a daemon). The phrase 'no anon mutations' is not the same as 'no silent autonomy' — autonomy is about agency, not authentication."
    artifacts:
      - path: "memory/decisions/0004-two-deployment-modes.md"
        issue: "§Consequences/Governance second bullet covers principle 2 ('direct writes scoped to owning_layer') via RLS but skips principle 6 ('no silent autonomy') almost entirely — it's mentioned in passing in §Decision but never reckoned with under §Consequences. The plan called this 'the most consequential governance document the project will ever have'; principle 6 is the principle most likely to silently drift under DB-mode and gets the least page-space."
      - path: "memory/tech/deployment-modes.md"
        issue: "§Invariant translation §6 says DB-mode enforces no silent autonomy via 'RLS policies + the trigger that blocks state mutations except via accept_proposal()/reject_proposal() SQL functions, which themselves require an authenticated human or named-agent identity'. This conflates authentication (we know WHO did it) with autonomy (was a human in the loop?). A scheduled pg_cron job running as a service role with an agent_id is authenticated AND silently autonomous."
    missing:
      - "Add a §Governance bullet (or new sub-section) to ADR-0004 explicitly addressing principle 6 under DB-mode: which DB-side constructs are forbidden by 'no silent autonomy' (pg_cron auto-accepting, webhooks that mutate state without human/agent click, MCP tools that loop accept→propose→accept). State whether MCP tools may chain mutations within a single tool invocation."
      - "Address the agent identity question: an MCP tool call with a tenant API key — is that 'a human in the loop' (the human clicked Run in their IDE) or 'silent autonomy' (the agent decided when to call)? The ADR should pick one and justify."
      - "Define the boundary: what triggers ARE permitted? (Append-only enforcement via DELETE-blocking trigger is fine.) What triggers are NOT permitted? (Triggers that auto-resolve queue items, auto-promote leaf-scope to org-scope, etc.)"

  - truth: "File-mode ↔ DB-mode mapping is complete in both directions"
    status: partial
    reason: "tech/deployment-modes.md §Mapping covers most file-mode surfaces but has gaps in both directions. File-mode artifacts not mapped to DB-mode: (a) ADRs are markdown files but their queue-resolution provenance (the original proposal in queue/_accepted/) is mapped to a separate proposals_accepted table — the cross-reference between an ADR (now a memory_files row) and its accepting proposal needs a column or join; (b) memory/_schema.md itself is a memory file but is also THE contract — DB-mode has no story for 'how is the schema enforced when the schema doc itself is a row?' — ADR §Decision says schema is enforced via a validate_memory_frontmatter() function but doesn't say where that function reads its rules from; (c) memory/_index.md is auto-generated by scripts/index-memory.sh in file-mode — DB-mode equivalent is unspecified (a materialized view? a regenerated row?). DB-mode artifacts not mapped back to file-mode: (a) tenant_id (file-mode is implicit single-tenant — fine, but unstated as a deliberate lossy projection); (b) RLS policies themselves (file-mode equivalent: filesystem permissions + git, claimed in the table but not elaborated); (c) Supabase Auth identities (file-mode equivalent: the actor string from a human running bash — claimed implicitly but the actor-string mapping deserves a row)."
    artifacts:
      - path: "memory/tech/deployment-modes.md"
        issue: "§Mapping table covers content artifacts (memory/, queue/, _log/, bindings.yaml) but skips meta artifacts (_schema.md, _index.md, scripts/, .claude/commands/). §Migration paths claims lossless conversion both ways but doesn't enumerate the lossy-by-design projections (tenant_id when going DB→file)."
    missing:
      - "Extend §Mapping table to cover: memory/_schema.md (and clarify that DB-mode validates frontmatter via a function whose rules derive from this same row), memory/_index.md (DB-mode materialized view OR no DB-mode equivalent because it's filesystem-affordance-only), scripts/*.sh (file-mode-only, deliberately not mapped — call this out), .claude/commands/bbc/*.md (BBC-skill-layer, not BBC-protocol-layer — out of scope explicitly)."
      - "Add a §Lossy-by-design projections sub-section to §Migration paths: file→DB is lossy on (filesystem mtime, git history, OS-level perms); DB→file is lossy on (tenant_id, RLS policies as data, Supabase Auth identity rows, per-tenant API keys, operations_log lkg_at_emit linkage to other tenants)."
      - "Add a row mapping the actor-string convention (human:provider:identifier from prior session work) to its DB-mode form (auth.uid() lookup yielding profile row that yields actor string)."

human_verification:
  - test: "Domain availability check at registrar"
    expected: "bbc.tools is purchasable at a non-extortionate premium-domain price"
    why_human: "The doc says 'DNS-checked 2026-05-08; possibly available — verify on registrar before purchase'. Registrar prices and availability change daily; only a human with a registrar account can confirm and pull the trigger."
  - test: "Read ADR-0004 alongside CLAUDE.md edit and confirm the principle 1 wording faithfully reflects ADR §Decision"
    expected: "User agrees the rewording does not weaken or drift; if it drifts, redo CLAUDE.md edit before committing."
    why_human: "Per CLAUDE.md §What changes this file: only a human at Main can edit CLAUDE.md, and the change is preceded by an ADR. The ADR was authored by an agent — the human-in-the-loop check on the principle wording is mandatory governance, not nice-to-have."
  - test: "Confirm the 'Phase 0 = 1 wk' framing actually got a week of soak time"
    expected: "User confirms ADR-0004 has been read, slept on, and re-read; not a same-day rush."
    why_human: "The plan explicitly flagged: 'Take a full week, not a day. Get it right.' All four docs were authored on 2026-05-08. There is no objective way to verify cognitive soak — only the user can confirm whether the document feels durable on day 7."
---

# Phase 0: Productization Foundation — Verification Report

**Phase Goal:** ADR in `bbc/memory/decisions/` evolving Main's principles for two-mode deployment + `bbc/CLAUDE.md` lock matrix + principle 1 update + `memory/architecture/deployment-modes.md` + repo decision (generalize `8azi-dashboard` → `bbc-dashboard`, keep `8azi-*` as `examples/` reference tenant).

**Verified:** 2026-05-08
**Status:** gaps_found
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                          | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | An ADR exists evolving Main's principles for two-mode deployment                               | ✓ VERIFIED | `memory/decisions/0004-two-deployment-modes.md` exists, 92 lines, status `accepted`, frontmatter valid against `_schema.md`, body has Context/Decision/Consequences/Supersedes/Source structure.                                                                                                                                                       |
| 2   | The ADR is substantive (the plan called this "the most consequential governance document")    | ✓ VERIFIED | The ADR explicitly names the two breaking properties of V1 (state location, mutation transport), produces a clean two-row Decision table, walks the 6 Main principles and translates each into the new mode, names the AGPL fork-vs-orphan tension as motivation, identifies three first-order risks (parity tax, schema drift, MCP backcompat). It is not handwavy. The companion `tech/deployment-modes.md` carries the heavy lifting on concrete schema. |
| 3   | `bbc/CLAUDE.md` principle 1 is updated to mode-aware wording                                   | ✓ VERIFIED | Working-tree diff shows principle 1 rewrite that moves the contract from filesystem-shape to schema-shape and names file-mode/DB-mode explicitly. Matches ADR §Consequences/Governance bullet 1. **Note: uncommitted, awaiting human commit per lock matrix; this is correct.**                                                                          |
| 4   | `bbc/CLAUDE.md` lock matrix is updated to reflect two-mode governance                          | ✗ FAILED   | The diff modifies only principle 1. The lock matrix table is byte-identical to baseline. ADR-0004 §Consequences/Governance bullet 2 explicitly commits to "A new lock-matrix row governs DB-mode tables..." — the row does not exist. CLAUDE.md's own §What changes this file says lock matrix and precedence rule must update **together** with principle changes. |
| 5   | `memory/architecture/deployment-modes.md` exists (or schema-permitted equivalent)              | ✓ VERIFIED | Lives at `memory/tech/deployment-modes.md` instead of `memory/architecture/`. The plan specified `architecture/`, but `memory/_schema.md` only permits categories `product/design/tech/ops/people/glossary/decisions`. Placing it under `tech/` is the schema-correct call. The body delivers a concrete file↔table mapping, storage interfaces, invariant translation, mode selection, migration paths. |
| 6   | File↔DB mapping is complete in both directions                                                 | ⚠️ PARTIAL | Content artifacts (memory/, queue/, _log/, bindings.yaml) mapped well. Meta artifacts (_schema.md, _index.md, scripts/, actor-string convention) and lossy-by-design projections in both directions are uncovered. See gap above. |
| 7   | Repo decision (monorepo + 8azi-dashboard generalization) is recorded concretely               | ✓ VERIFIED | `memory/tech/repo-structure.md` lays out a complete tree (apps/, packages/, examples/, templates/), names pnpm workspaces specifically, gives a 6-step migration plan from 8azi-dashboard → apps/dashboard/, calls out what stays separate (8azi-web, 8azi-api). Concrete enough for a Phase 1 first-task starter to execute without further design work. |
| 8   | Index + governance compliance maintained                                                       | ⚠️ PARTIAL | `memory/_index.md` references all 4 new entries (ADR-0004 under decisions, tech-deployment-modes and tech-repo-structure under tech, ops-deployment-targets under ops). **However:** the ops table has a stray empty row (line 31: \`\| `` \| \| \| \| \|\`) — index regeneration introduced a junk row, probably from a blank line in `memory/ops/`. Cosmetic but the index is auto-generated, so this implies `scripts/index-memory.sh` has a bug or an unexpected sibling file. |

**Score:** 5/8 truths fully verified, 2 partial, 1 failed.

### Required Artifacts

| Artifact                                       | Expected                                              | Status     | Details                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `memory/decisions/0004-two-deployment-modes.md` | ADR evolving principles                               | ✓ VERIFIED | 92 lines, accepted, well-structured                                                                  |
| `memory/tech/deployment-modes.md`              | Concrete file↔DB mapping                              | ⚠️ STUB-FREE BUT INCOMPLETE | 138 lines, accepted; mapping covers content artifacts but skips meta artifacts                       |
| `memory/tech/repo-structure.md`                | Monorepo + bbc-dashboard plan                         | ✓ VERIFIED | 173 lines, accepted, executable 6-step migration plan                                                |
| `memory/ops/deployment-targets.md`             | DNS + hosting + subdomain layout                      | ✓ VERIFIED | 80 lines, accepted, covers domain pick + 5 subdomains + DNS records + reserved subdomains             |
| `CLAUDE.md` (principle 1 edit)                 | Mode-aware rewording matching ADR                     | ✓ VERIFIED | Working tree (uncommitted; correctly so per lock matrix)                                              |
| `CLAUDE.md` (lock matrix update)               | New row(s) for DB-mode tables                         | ✗ MISSING  | Lock matrix is unchanged from baseline                                                                |
| `memory/_index.md`                             | Index reflects 4 new entries                          | ⚠️ DIRTY   | All 4 entries present; stray empty row at line 31 in `ops` section                                    |

### Key Link Verification

| From                              | To                                            | Via                                  | Status     | Details                                                                                       |
| --------------------------------- | --------------------------------------------- | ------------------------------------ | ---------- | --------------------------------------------------------------------------------------------- |
| ADR-0004                          | tech/deployment-modes.md                      | "Companion to ADR-0004" + body cite  | ✓ WIRED    | tech/deployment-modes.md line 16 explicitly companions; ADR §Consequences references store interface |
| ADR-0004                          | CLAUDE.md principle 1                         | ADR §Consequences/Governance bullet 1 cites principle 1 wording | ✓ WIRED    | Wording in working-tree CLAUDE.md matches ADR almost verbatim                                  |
| ADR-0004                          | CLAUDE.md lock matrix new row                 | ADR §Consequences/Governance bullet 2 commits to a new row     | ✗ NOT_WIRED | ADR promises the row; CLAUDE.md does not deliver it                                           |
| tech/repo-structure.md            | ADR-0004                                      | "Companion to ADR-0004"              | ✓ WIRED    | Line 16 explicit                                                                              |
| ops/deployment-targets.md         | ADR-0004 + tech/repo-structure.md             | "Companion to ADR-0004 and tech/repo-structure.md" | ✓ WIRED    | Line 14 explicit                                                                              |
| ADR-0004                          | ADR-0001 (extends, not supersedes)            | §Supersedes section                  | ✓ WIRED    | Explicitly: "ADR-0001 ... is **extended**, not replaced"                                       |

### Anti-Patterns Found

| File                       | Line | Pattern                                              | Severity   | Impact                                                                                                                                                       |
| -------------------------- | ---- | ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `memory/_index.md`         | 31   | Empty/junk row in auto-generated table               | ℹ️ Info    | Cosmetic; suggests `scripts/index-memory.sh` mis-handled a blank file or stray newline in `memory/ops/`. Doesn't block Phase 1.                              |
| `memory/tech/deployment-modes.md` | 135  | "Schema DDL — lives in `8azi-dashboard/...`"  | ⚠️ Warning | Document still names `8azi-dashboard` as the home of migrations even though `tech/repo-structure.md` (same author, same day) decided migrations move to `apps/dashboard/supabase/migrations/`. Internal inconsistency between two docs accepted in the same commit set. |
| `memory/decisions/0004-two-deployment-modes.md` | (whole §Governance) | Principle 6 ("no silent autonomy") barely engaged with under §Consequences | 🛑 Blocker | The plan explicitly flagged this as the most consequential governance document. Skipping the principle-6 evolution here is the kind of silent weakening CLAUDE.md §What-changes-this-file forbids. See gap #2. |

### Human Verification Required

1. **Domain availability check at registrar.** `ops/deployment-targets.md` says `bbc.tools` is "possibly available — verify on registrar before purchase". Only a human can confirm price + availability and pull the trigger.

2. **Read principle 1 alongside ADR-0004 and ratify the wording.** Lock-matrix rule: only a human can commit `CLAUDE.md`. The agent drafted the rewording — the human-in-the-loop ratification is the governance contract, not a formality.

3. **Confirm the "1 week" soak.** The plan said "Take a full week, not a day." All four docs are dated 2026-05-08. There is no programmatic way to verify cognitive durability — only the user can confirm whether re-reading on day 7 still feels right.

### Gaps Summary

Phase 0 substantively delivered the four memory documents. Quality is high: the ADR is structurally complete, the deployment-modes spec is concrete enough to drive Phase 2 (storage interface) without further design, the repo-structure doc is executable as the first Phase 1 task, and the deployment-targets doc covers the surface that Phase 9 will consume. The principle-1 rewording is faithful to the ADR and correctly left uncommitted for the human.

**Three blockers remain before Phase 1 should start:**

1. **Lock matrix gap (FAILED).** The ADR commits to a new lock-matrix row for DB-mode tables; `CLAUDE.md` does not deliver it. CLAUDE.md's own self-amendment clause requires lock matrix and principle changes to ship together. Shipping the principle-1 edit without the matrix row is the precise pattern the doc forbids.

2. **Principle 6 ("no silent autonomy") under-evolved (BLOCKER).** The ADR §Consequences/Governance covers principle 1 thoroughly and principle 2 (RLS) cleanly, but principle 6 is the principle most likely to silently drift under DB-mode (triggers, pg_cron, webhooks, MCP tool chaining), and it gets one passing reference. The plan flagged this exact concern: "the most consequential governance document." Re-engagement needed: enumerate which DB-side constructs are forbidden by principle 6, and decide whether MCP-tool-chains-without-human-confirmation count as autonomous.

3. **File↔DB mapping has meta-artifact gaps (PARTIAL).** Mapping covers content (memory/, queue/, _log/, bindings.yaml) but skips meta artifacts (_schema.md self-reference, _index.md, scripts/, actor-string convention). And §Migration paths claims lossless both ways without enumerating the lossy-by-design projections (tenant_id on DB→file, filesystem mtime/git-history on file→DB).

**One inconsistency between docs:** `tech/deployment-modes.md` line 135 says migrations live in `8azi-dashboard/supabase/migrations/`; `tech/repo-structure.md` (same commit set) decides they move to `apps/dashboard/supabase/migrations/`. Trivial fix.

**One cosmetic glitch:** `_index.md` line 31 has a junk empty row — likely a `scripts/index-memory.sh` bug worth filing as a Phase 1 cleanup task.

Recommendation: do not commit the CLAUDE.md edit until the lock matrix update lands in the same diff. Re-open ADR-0004 to extend §Consequences/Governance with principle 6 evolution. Then re-verify before starting Phase 1.

---

_Verified: 2026-05-08_
_Verifier: Claude (gsd-verifier)_
