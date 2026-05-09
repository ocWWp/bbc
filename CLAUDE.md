# CLAUDE.md — Main (BBC second gateway)

This is the **highest-priority** instruction file in BBC. It defines who decides what, where memory lives, and how change happens. Lower layers cannot override this file.

If you are starting a session anywhere inside `bbc/`, read this first. If you are starting a session inside `bbc/manager/` or `bbc/distribution/<leaf>/`, read this first, then your layer's `CLAUDE.md`.

## Precedence rule

```
Main (this file) > Manager (bbc/manager/CLAUDE.md) > Distribution (bbc/distribution/<leaf>/CLAUDE.md)
```

A lower-layer document can **specialize** an upper rule (add detail, scope to a subset). It cannot **override**, **weaken**, or **contradict** an upper rule. If a conflict arises, Main wins; the agent flags the conflict and stops the action.

## Lock matrix

| What | Who can edit directly | Who can propose edits |
|---|---|---|
| `bbc/CLAUDE.md` (this file) | Human at Main, in BBC repo | Anyone may file an ADR proposal under `memory/decisions/` requesting Main to edit. |
| `memory/**` files where `owning_layer: main` | Main session, after `accept.sh` of a proposal | Manager and Distribution via `scripts/propose.sh` |
| `memory/**` files where `owning_layer: manager` | Manager session | Distribution via `scripts/propose.sh` |
| `manager/CLAUDE.md` | Manager session + humans | Distribution via `scripts/propose.sh` |
| `manager/rules/**` | Manager session | Distribution via `scripts/propose.sh` |
| `distribution/<leaf>/**` | That leaf's session + humans | n/a (other leaves cannot reach across) |
| `queue/*.md` (proposal body + frontmatter fields written by `propose.sh`) | `propose.sh`, `accept.sh`, `reject.sh` only | n/a |
| `queue/*.md` review annotation blocks (`manager_review:`, `cross_leaf_impact:`, `promotion_check:`) | Manager session | n/a — Manager appends directly per ADR-0002 |
| `queue/_accepted/**`, `queue/_rejected/**` | `accept.sh`, `reject.sh` only — immutable once archived | n/a |

## Non-negotiable principles

1. **Memory is the contract.** All durable knowledge lives in `memory/` as Markdown + YAML frontmatter (schema in `memory/_schema.md`). If a fact isn't in memory, it isn't real.
2. **Direct writes are scoped to your `owning_layer`.** Anything else goes through the queue.
3. **Proposals are append-only; resolutions move (not delete).** Accepted proposals land in `queue/_accepted/`, rejected in `queue/_rejected/`. Both stay forever — they are the audit trail.
4. **Vendor names are not architecture.** Roles (`llm-provider`, `db-provider`, `email-delivery`) live in `memory/ops/vendors.md`. Any other file that needs to mention a vendor cites that file. This protects us from vendor churn.
5. **Voice is single-source.** `memory/design/voice-tone.md` is canonical. The cross-repo voice anchors (`pillar-interactions.ts`, `prompts.py`) are downstream consumers.
6. **No silent autonomy.** V1 has no daemons, no background agents, no auto-accept. Every state change is either a human edit at the layer that owns the file, or a queued proposal that passes through `accept.sh` / `reject.sh`.

## What changes this file

This file is locked from below. Only a human editor working at Main, in the BBC repo, can change it. The change must:

- Be preceded by a new ADR in `memory/decisions/` explaining why.
- Update the lock matrix and the precedence rule together if either changes.
- Bump no other rules silently — every removed or weakened principle must be called out in the ADR.

## What this file does NOT decide

Out of scope here (delegated to Manager or to follow-on phases F1–F4):

- Specific product workflows, deadlines, or PRD content → Manager + `memory/product/`.
- Per-repo conventions, code style, build commands → Distribution leaves.
- Tool credibility scoring (F1), OOP skill inheritance (F2), shadow brain failover (F3), provider interface (F4) — see `.planning/ROADMAP.md`.

## Quick map

- Memory: `memory/` (schema in `memory/_schema.md`, index in `memory/_index.md`)
- Manager rules: `manager/CLAUDE.md`, `manager/rules/`
- Leaves: `distribution/_template/` (start here when adding a leaf)
- Queue: `queue/` + `queue/README.md` (file format)
- Scripts: `scripts/{propose,accept,reject,bootstrap-leaf,index-memory}.sh`
- Roadmap: `.planning/ROADMAP.md`
