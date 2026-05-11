# STATE

## Current phase

V1 + F1–F4 shipped. Three leaves: 8azi-web, 8azi-api, dashboard. Dashboard live with read + write-back. Architecture durable; further work optional.

## Phase status

- [x] 01-bbc-bootstrap
- [x] 02-memory-schema
- [x] 03-claudemd-trio
- [x] 04-queue-protocol
- [x] 05-leaf-bootstrap
- [x] 06-verification (passed via 3-subagent multi-session walkthrough)
- [x] 07-polish (3 gaps from agent feedback closed; verified by second walkthrough)
- [x] 08-builtin-commands (6 essential `/bbc:*` slash commands implemented + 3-subagent walkthrough passed + 5 runbook gaps fixed)
- [x] 09-flagged-fixes (lock matrix carve-out via ADR-0002 + patch warning capture + accept.sh `--dry-run`)
- [x] F1-credibility-ranker (DESIGN: five-stage pipeline + scoring formula)
- [x] F1-build-1-profiles (3 profiles authored)
- [x] F1-build-2-ranker (`rank.sh` shipped; pure-function ranker tested)
- [x] F1-build-3-4-outcomes (`outcome-log.sh`, `outcome-aggregate.sh`, `binding-update.sh` shipped)
- [x] F2-skill-inheritance (DESIGN: UML + override modes + polymorphic resolver + 6 user stories)
- [x] F2-build-1-skills (4 abstract bases + 3 general skills)
- [x] F2-build-2-resolver (`resolve-skills.sh` + `validate-skill-tree.sh`)
- [x] F2-build-3-4-specialization-commands (3 leaf specializations + `/bbc:invoke` + `/bbc:skill-trace`)
- [x] F3-shadow-brain (DESIGN: versioned log + 6-step promotion + de-confliction)
- [x] F3-build-1-log-emission (`log-emit.sh` wired into all 4 mutating scripts; LKG advance)
- [x] F3-build-2-5-failover-scaffolding (heartbeat-emit, shadow-watch, promote, deconflict, /bbc:failover-status, /bbc:promote, log-auditor agent — single-host functional; real failover requires Shadow VM)
- [x] F4-provider-interface (DESIGN: three-layer YAML model + decommissioning workflow)
- [x] F4-build-1-data-model (11 role contracts + 9 adapter declarations + bindings.yaml + no-vendor-names rule)
- [x] F4-build-2-consumer-tagging (`scripts/validate-providers.sh` + 10 `bbc-provider:<id>` tags in 8azi-api/ and 8azi-web/)
- [x] F4-build-3-decom-rehearsal (mobbin walked Announce → Quarantine → Purge end-to-end; 4 findings captured)
- [x] F4-build-4-decom-commands (`/bbc:decommission` + `/bbc:bind`)
- [x] M1-8azi-web-leaf (first real leaf migrated; hybrid leaf-vs-pointer convention with `.bbc-leaf/` marker)
- [x] D-leaf-migration (8azi-dashboard promoted to real BBC leaf; CLAUDE.md customized + `.bbc-leaf/README.md` written; reconciled prior-session inconsistency)
- [x] D1-dashboard-pm-tab (Next.js 16 dashboard rebuilt after prior session's wipe; 22 files; 4 routes /, /queue, /log, /bindings; server actions for Accept/Reject; tsc clean)
- [x] M2-8azi-api-leaf (second real leaf migrated; cross-repo upstream for voice anchor + Nayin invariants; backend security floor encoded in leaf rules)

## Next (post-M1)

V1 + all F-build phases + first real leaf done. Substantive next options:

- **M2 — Migrate `8azi-api` as second leaf.** Mirrors M1's hybrid convention. Adds the `8azi-api.pr-review` skill already authored.
- **F4-build-3 follow-ups.** Close the 4 findings: multi-hunk patch atomicity, supersede→archived for adapters, file-move support, archive index.
- **F1 trust signal verification.** Replace ASSUMED metadata in adapter YAMLs with measured values; populate stability/external/declared blocks.
- **F3 activate failover.** Provision a Shadow VM, set `log_remote` + `shadow_host`, run heartbeat-emit + shadow-watch as daemons.
- **Stop and let it sit.** Architecture is durable.

## Last update

2026-05-08 — End-to-end build sweep complete. All 11 phases (F1-build-1..4, F2-build-1..4, F3-build-1..5, F4-build-3..4, M1) shipped in one session. Each phase has its own SUMMARY.md with the gaps it surfaced. Test residue archived in `.test-archive/`. The 10 `bbc-provider:<id>` tags in 8azi-api/ and 8azi-web/ remain uncommitted — yours to review and commit. The `.bbc-leaf/` marker in 8azi-web/ is also uncommitted.
