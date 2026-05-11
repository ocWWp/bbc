# ROADMAP — BBC

Locked scope: V1 = memory + 3-layer Claude.md hierarchy + proposal queue. Skeleton only. Everything else is named follow-on or migration.

## V1 phases

| # | Phase | Goal | Acceptance signal |
|---|---|---|---|
| **01** | bbc-bootstrap | Repo skeleton, GSD `.planning/`, top-level READMEs in place. | Tree matches `README.md` layout; `.planning/STATE.md` shows phase 01 complete. |
| **02** | memory-schema | Frontmatter spec written; one real seed file per category. | `scripts/index-memory.sh` regenerates `memory/_index.md` deterministically. |
| **03** | claudemd-trio | Main + Manager + `_template` Distribution CLAUDE.md authored with locked precedence rule. | Fresh agent given only `bbc/` can recite the precedence rule and lock matrix. |
| **04** | queue-protocol | `queue/`, `propose.sh`, `accept.sh`, `reject.sh`, queue file frontmatter doc. | Round-trip: propose → accept → memory updates → file in `_accepted/`. |
| **05** | leaf-bootstrap | `_template` + `8azi-web-stub` bootstrap correctly via `bootstrap-leaf.sh`. | Running script in empty dir produces a valid leaf reading Main+Manager headers. |
| **06** | verification | End-to-end test passes; AGENTS.md + README.md final. | 5-step walkthrough completes without manual fixes. |

## Follow-on design phases

All four designed (2026-05-08). Each design has its own `phases/F<N>-*/PLAN.md` and `SUMMARY.md`. Implementation is broken into named build sub-phases per design; each gets its own plan when started.

- **F1 — Tool credibility ranker:** [DESIGNED] Five-stage pipeline (profiles → hard-constraint filter → trust scoring → ranker formula → learning loop) replacing the "BBC magically picks tools" hand-wave. Builds on F4's adapter model. Build sub-phases: F1-build-1 (profiles), F1-build-2 (`rank.sh`), F1-build-3 (outcome rollup), F1-build-4 (binding-update integration).
- **F2 — OOP skill inheritance:** [DESIGNED] Real OOP for skills: abstract bases, `extends:`, override modes (`replace` / `add` / `remove`), polymorphic resolution by caller layer. Six user stories. Build sub-phases: F2-build-1 (abstract + general.* skills), F2-build-2 (resolver + validator), F2-build-3 (first leaf specialization), F2-build-4 (`/bbc:invoke` + `/bbc:skill-trace`).
- **F3 — Shadow brain failover:** [DESIGNED] One-Primary-one-Shadow with versioned JSONL log, heartbeat (default 30s), 3-miss failover threshold (~90s worst case), six-step promotion (Detection → Ingestion → Identification → Validation → Promotion → De-confliction). Build sub-phases: F3-build-1 (log infra), F3-build-2 (heartbeat), F3-build-3 (promotion), F3-build-4 (de-confliction), F3-build-5 (UX).
- **F4 — Provider interface:** [DESIGNED] Three-layer YAML model (roles + adapters + bindings), no-vendor-names-in-prose rule, Announce/Quarantine/Purge decommissioning. Build sub-phases: F4-build-1 (data model from `vendors.md`), F4-build-2 (consumer-code tagging), F4-build-3 (decommission rehearsal), F4-build-4 (`/bbc:decommission` + `/bbc:bind`).

## Migration phases (post-V1)

Migrate existing 8azi repos onto BBC.

- **M1 — 8azi-web as leaf:** point `distribution/8azi-web/` at the real repo; split current `8azi-web/CLAUDE.md` into Main/Manager/leaf scopes.
- **M2 — 8azi-api as leaf:** same for API. Existing cross-repo sync (Nayin lookup, voice rhythm) becomes a Manager-owned rule with leaves as enforcers.
- **M3 — 8azi-market as leaf:** new workstream slots in via `_template`.

## Open questions to resolve before / during phases

| Phase | Question | Default if unanswered |
|---|---|---|
| 02 | Wikilinks for cross-memory references? | Yes for cross-memory only; relative paths elsewhere. |
| 03 | Main self-update on new tool — autonomous or human? | Human edit + CHANGELOG line in V1. |
| 03 | Communication mechanism Manager↔Main↔Distribution? | Implicit re-read on session start; no daemons. |
| 04 | Concurrent proposals to same target file? | Last-writer-wins flagged; resolution policy → future Manager rule. |
| M1 | Real-repo leaf: symlink vs `.bbc-leaf` pointer? | Decide in M1 plan. |
