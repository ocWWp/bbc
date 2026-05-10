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

**Phase Goal:** ADR in `bbc/memory/decisions/` evolving Main's principles for two-mode deployment + `bbc/CLAUDE.md` lock matrix + principle 1 update + `memory/architecture/deployment-modes.md` + repo decision (generalize `bbc-dashboard` → `bbc-dashboard`, keep `tenant-*` as `examples/` reference tenant).

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
| 7   | Repo decision (monorepo + bbc-dashboard generalization) is recorded concretely               | ✓ VERIFIED | `memory/tech/repo-structure.md` lays out a complete tree (apps/, packages/, examples/, templates/), names pnpm workspaces specifically, gives a 6-step migration plan from bbc-dashboard → apps/dashboard/, calls out what stays separate (<tenant-app-web>, <tenant-app-api>). Concrete enough for a Phase 1 first-task starter to execute without further design work. |
| 8   | Index + governance compliance maintained                                                       | ⚠️ PARTIAL | `memory/_index.md` references all 4 new entries (ADR-0004 under decisions, tech-deployment-modes and tech-repo-structure under tech, ops-deployment-targets under ops). **However:** the ops table has a stray empty row (line 31: `\| `` \| \| \| \| \|`) — index regeneration introduced a junk row, probably from a blank line in `memory/ops/`. Cosmetic but the index is auto-generated, so this implies `scripts/index-memory.sh` has a bug or an unexpected sibling file. |

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
| `memory/tech/deployment-modes.md` | 135  | "Schema DDL — lives in `bbc-dashboard/...`"  | ⚠️ Warning | Document still names `bbc-dashboard` as the home of migrations even though `tech/repo-structure.md` (same author, same day) decided migrations move to `apps/dashboard/supabase/migrations/`. Internal inconsistency between two docs accepted in the same commit set. |
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

**One inconsistency between docs:** `tech/deployment-modes.md` line 135 says migrations live in `bbc-dashboard/supabase/migrations/`; `tech/repo-structure.md` (same commit set) decides they move to `apps/dashboard/supabase/migrations/`. Trivial fix.

**One cosmetic glitch:** `_index.md` line 31 has a junk empty row — likely a `scripts/index-memory.sh` bug worth filing as a Phase 1 cleanup task.

Recommendation: do not commit the CLAUDE.md edit until the lock matrix update lands in the same diff. Re-open ADR-0004 to extend §Consequences/Governance with principle 6 evolution. Then re-verify before starting Phase 1.

---

_Verified: 2026-05-08_
_Verifier: Claude (gsd-verifier)_

---

# Re-verification (post-commit 7430eef)

**Verified:** 2026-05-08T00:00:00Z (round 2)
**Mode:** Re-verification — checking only the three blockers from round 1 plus a coherence pass.
**Status:** **passed**
**Score:** 3/3 gap-fixes verified; coherence clean.

## Round-1 gaps revisited

### Gap 1 — Lock matrix row for DB-mode: ✓ VERIFIED (sufficient, not cosmetic)

`bbc/CLAUDE.md` line 21 (working tree, uncommitted as required) now contains a new row:

> `memory_files` rows where `owning_layer: main` (DB-mode) | Mutable only via `accept_proposal()` / `reject_proposal()` SQL functions invoked by an authenticated Main-role identity. RLS policy enforces this at the DB layer; no direct UPDATE/DELETE permitted, even from the service role except inside the named functions. | Manager and Distribution via `propose_change()` SQL function (DB-mode equivalent of `scripts/propose.sh`); see ADR-0004 §Consequences/Governance bullet 2.

This row is **substantive**, not cosmetic, on three grounds:

1. It names the **mechanism of enforcement** (RLS policy at the DB layer), not just the policy. That pins the implementation in Phase 2 — the storage layer cannot ship without RLS that satisfies this row.
2. It explicitly closes the service-role escape hatch ("no direct UPDATE/DELETE permitted, even from the service role except inside the named functions"). This is the loophole that round-1 flagged would otherwise be silent — service-role keys are how Supabase server code typically writes, and absent this clause the lock-matrix row would be defeated by any `service_role`-keyed Next.js route handler.
3. It cites ADR-0004 §Consequences/Governance bullet 2 by reference, which closes the round-1 anti-pattern of "principle 1 evolves but the matrix doesn't."

The existing file-mode row above it (line 20) was correctly narrowed to "(file-mode)" so the two coexist without ambiguity.

**Remaining narrower gap (non-blocking):** the original VERIFICATION.md round-1 listed seven additional DB-mode tables that ought to appear in the matrix (`memory_files` for owning_layer=manager, owning_layer=distribution, `queue_items`, `proposals_accepted`, `proposals_rejected`, `operations_log`, `bindings`). Only the `owning_layer:main` row landed. That is defensible: the ADR commits specifically to that row and the others can land as Phase-2 the schema lands. But it does mean the matrix is **incomplete by design** for the next phase — flag it for Phase 2 to extend rather than re-block Phase 0.

### Gap 2 — Principle 6 under-evolved: ✓ VERIFIED (substantive ruling table)

ADR-0004 lines 60–74 add a new §Consequences/Governance bullet that runs a per-construct ruling table covering 9 DB-side constructs. Spot-check against the round-1 missing list:

| Round-1 worry | Addressed in table? | Where |
|---|---|---|
| pg_cron auto-accepting | Yes | Row 2 ("pg_cron mutating memory_files / queue_items / owning_layer:main → **Forbidden**") |
| pg_cron housekeeping (refresh views, GC) | Yes | Row 3 ("**Allowed.** Read-derived or housekeeping work") |
| Outbound webhooks | Yes | Row 4 ("**Allowed**, attribution chain intact") |
| Inbound webhooks mutating state | Yes | Row 5 ("**Allowed only if** named identity AND constrained scope") |
| Realtime subscriptions firing UI side-effects | Yes | Row 6 ("**Allowed.** Read-only push") |
| MCP tools acting as a delegated tool | Yes | Row 7 ("**Allowed if** logged with `actor: agent:<api_key_id>`") |
| MCP tool chaining (the "loop accept→propose→accept" worry) | Yes | Row 8 ("**Allowed if** chain is explicitly user-requested") |
| Auto-accept by any rule or model | Yes | Row 9 ("**Forbidden, full stop.**") |
| Triggers as deterministic in-transaction effects | Yes | Row 1 ("**Allowed.** Same logical action as the user's") |

Plus the closing sentence: **"New constructs not listed here default to forbidden until an ADR adds them."** This is the meta-rule round-1 was asking for; it's the contract that prevents drift on constructs we haven't thought of yet.

The ruling on the agent-identity question that round-1 flagged ("is an MCP tool call human-in-the-loop or silent autonomy?") is decided in row 7: the agent acts as a delegated tool, not an autonomous decision-maker, **provided** each call is independently logged with `actor: agent:<api_key_id>` AND the agent does not invoke a tool the human did not directly authorize within that session. That's a defensible and falsifiable line — "the human authorized this within this session" is observable from the conversation/request ID required by the same row.

The MCP tool-chaining row (8) explicitly invokes the substitution test: "the user could have invoked each tool themselves and the agent is just batching." This is the right framing for that hard case.

**Possible gaps not in the table** (non-blocking, but flag for future ADRs):
- **Postgres `LISTEN`/`NOTIFY` driving server-side handlers** — not addressed. Realistically falls under "Realtime push" (row 6) but only if the listener is read-only; a `LISTEN` that triggers a server-side `INSERT` is closer to pg_cron and should be forbidden.
- **Supabase Edge Functions invoked on a schedule** — not addressed by name. The ADR addresses pg_cron but Supabase has *two* scheduled-execution surfaces (pg_cron in DB, scheduled Edge Functions in the platform layer). The "default to forbidden" meta-rule covers this, but it's worth naming the second one explicitly when a future ADR adds it.
- **Database functions invoked by a `BEFORE INSERT` trigger that themselves call out to an HTTP endpoint** — chains rows 1 and 5 in a way the table doesn't directly cover. Currently row 1 ("triggers are deterministic in-transaction effects") is too permissive if the trigger does I/O. Phase 2 schema review should flag any such trigger.

These are forward-looking gaps, not round-1 regressions. The fix is sufficient for Phase 0 closure.

`memory/tech/deployment-modes.md` §Invariant translation §6 (lines 113–115) was rewritten and now correctly:
- Cites the ADR's per-construct ruling table as the authoritative reference.
- Distinguishes authentication from autonomy ("an agent acting on behalf of a user is OK; an agent acting on its own deliberation is not"), which directly answers round-1's confusion about authenticated≠human-in-the-loop.
- Re-states the four headline bans (pg_cron for state mutations, inbound webhook scope rules, named identity required, auto-accept forbidden).

### Gap 3 — Path consistency: ✓ VERIFIED (zero residual references)

`grep -rn "bbc-dashboard/supabase" memory/ CLAUDE.md` returns zero hits. The previously offending line in `memory/tech/deployment-modes.md` §Out of scope now reads:

> Schema DDL — lives in `apps/dashboard/supabase/migrations/0003+...sql` (Phase 1–2 of productization). The path reflects the monorepo layout decided in `tech/repo-structure.md`; the actual move from `bbc-dashboard/` happens as Phase 1's first task.

This is the right framing: it cites the canonical path (`apps/dashboard/...`), explicitly references `tech/repo-structure.md` as the source of truth for the layout, and acknowledges the move-from-`bbc-dashboard/` as a Phase-1 task (not a Phase-0 commitment). The single remaining mention of `bbc-dashboard` is in the migration-source phrasing, which is correct — that path *is* where the code lives today.

## Coherence pass (new check)

Re-read all four Phase 0 docs end-to-end (`CLAUDE.md`, ADR-0004, `tech/deployment-modes.md`, `tech/repo-structure.md`, `ops/deployment-targets.md`) looking for new contradictions introduced by the fixes.

**ADR §Consequences/Governance principle-6 table vs. tech/deployment-modes.md §6 — coherent.** Spot-check on the high-risk items:

| Construct | ADR ruling | tech/deployment-modes.md §6 wording | Coherent? |
|---|---|---|---|
| pg_cron mutating protocol state | Forbidden | "pg_cron is forbidden for protocol-state mutations and allowed for housekeeping" | ✓ Yes |
| Inbound webhook mutations | Allowed only with named identity + constrained scope | "Inbound webhooks must carry a named-identity actor string ... and a constrained scope" | ✓ Yes |
| Auto-accept by rule/model | Forbidden full stop | "Auto-accept by any rule or trained model is forbidden" | ✓ Yes |
| MCP delegated tool calls | Allowed with `actor: agent:<api_key_id>` logging | "either a human (Supabase Auth user) **or** a named agent (MCP API key with an `agent_id`)" | ✓ Yes |
| Authentication ≠ autonomy | Implied by row 7 framing ("delegated tool, not autonomous decision-maker") | Explicit: "an agent acting on behalf of a user is OK; an agent acting on its own deliberation is not" | ✓ Yes |

The tech doc's §6 acts as the reader-friendly summary; the ADR is the authoritative table. They cite each other in both directions and don't drift on any of the rulings I checked.

**Lock matrix row vs. ADR §Consequences bullet 2 — coherent.** The row in `CLAUDE.md` line 21 quotes the ADR's mechanism almost verbatim and cites it explicitly. The "even from the service role except inside the named functions" clause is **stronger** than the ADR text strictly required — that's a good direction; the lock matrix narrows the surface, doesn't widen it.

**Lock matrix row vs. tech/deployment-modes.md §Invariant translation §2 — coherent.** Both say RLS policy enforces owning-layer scoping; the matrix row adds the `accept_proposal()`/`reject_proposal()` requirement on top, which is consistent with §3 of the same doc (proposals append-only via the named transactions).

**Path-fix vs. tech/repo-structure.md — coherent.** `apps/dashboard/supabase/migrations/` matches the monorepo layout in repo-structure.md lines 84-85. The "first task of Phase 1" framing in deployment-modes.md §Out of scope matches the §Migration plan in repo-structure.md (which also calls the move "the first task of Phase 1").

**No new contradictions introduced.**

## Re-verification status

All three round-1 gaps closed sufficiently. The lock-matrix row meaningfully constrains DB-mode writes (not cosmetic). The principle-6 table is substantive — it rules on the hard cases (pg_cron, MCP chaining, inbound webhooks, auto-accept) and installs a "default-forbidden for new constructs" meta-rule. The path inconsistency is fully eliminated. ADR §Consequences and tech/deployment-modes.md §6 say the same thing; coherence is intact.

**Round-1 partial gap on file↔DB meta-artifact mapping (truth #6) was not in scope for this re-verification round** and remains as round-1 listed it. Suggest folding into Phase 2's storage-interface design rather than re-blocking Phase 0.

**Recommendation:** Phase 0 may close. The two human-verification items still apply (registrar pull-trigger; commit the CLAUDE.md edit only after a human reads principle 1 + the new lock-matrix row alongside ADR-0004). The "1 week soak" item is unchanged — still cognitive, still human-only.

_Re-verified: 2026-05-08_
_Verifier: Claude (gsd-verifier)_
