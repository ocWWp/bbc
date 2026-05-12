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
| `memory/**` files where `owning_layer: main` (file-mode) | Main session, after `accept.sh` of a proposal | Manager and Distribution via `scripts/propose.sh` |
| `memory_files` rows where `owning_layer: main` (DB-mode) | Mutable only via `accept_proposal()` / `reject_proposal()` SQL functions invoked by an authenticated Main-role identity. RLS policy enforces this at the DB layer; no direct UPDATE/DELETE permitted, even from the service role except inside the named functions. | Manager and Distribution via `propose_change()` SQL function (DB-mode equivalent of `scripts/propose.sh`); see ADR-0004 §Consequences/Governance bullet 2. |
| `memory/**` files where `owning_layer: manager` | Manager session | Distribution via `scripts/propose.sh` |
| `manager/CLAUDE.md` | Manager session + humans | Distribution via `scripts/propose.sh` |
| `manager/rules/**` | Manager session | Distribution via `scripts/propose.sh` |
| `distribution/<leaf>/**` | That leaf's session + humans | n/a (other leaves cannot reach across) |
| `queue/*.md` (proposal body + frontmatter fields written by `propose.sh`) | `propose.sh`, `accept.sh`, `reject.sh` only | n/a |
| `queue/*.md` review annotation blocks (`manager_review:`, `cross_leaf_impact:`, `promotion_check:`) | Manager session | n/a — Manager appends directly per ADR-0002 |
| `queue/_accepted/**`, `queue/_rejected/**` | `accept.sh`, `reject.sh` only — immutable once archived | n/a |
| `ingestion_sources` rows (DB-mode, `owning_layer: manager`) | Authenticated tenant member where `created_by = auth.uid()` (insert + status updates on own rows). Cross-row policy changes via Manager session. | Distribution via `propose_change()` SQL function; see ADR-0005. |
| `memory_file_sources` join (DB-mode) | Inherits ownership from parent `memory_files` row; member-insert when both sides are owned by the member's tenant. | n/a |
| `external_accounts` rows (DB-mode, Phase K placeholder) | Manager session (per-tenant OAuth credential records); table created in Phase K. | n/a |
| `studio_runs` rows (DB-mode) | Authenticated tenant member where `created_by = auth.uid()` (insert + status updates on own rows). | n/a — Studio runs are generated content, not memory; no cross-tenant propose path. See ADR-0006. |
| `studio_template_overrides` rows (DB-mode) | Authenticated tenant member where `created_by = auth.uid()` (insert + soft-delete via `active=false`). Conversational override creation is server-side only. | n/a |

## Non-negotiable principles

1. **Memory is the contract.** All durable knowledge is captured by the schema in `memory/_schema.md` — that schema is the contract; storage is a binding. In **file-mode** (single-tenant self-host), memory is materialized as Markdown + YAML frontmatter under `memory/`. In **DB-mode** (multi-tenant SaaS), it is materialized as RLS-gated rows in `memory_files` and related tables. Both modes coexist. See ADR-0004 and `memory/tech/deployment-modes.md`. If a fact isn't in memory (whichever mode), it isn't real.
2. **Direct writes are scoped to your `owning_layer`.** Anything else goes through the queue.
3. **Proposals are append-only; resolutions move (not delete).** Accepted proposals land in `queue/_accepted/`, rejected in `queue/_rejected/`. Both stay forever — they are the audit trail.
4. **Vendor names are not architecture.** Roles (`llm-provider`, `db-provider`, `email-delivery`) live in `memory/ops/vendors.md`. Any other file that needs to mention a vendor cites that file. This protects us from vendor churn.
5. **Voice is single-source.** `memory/design/voice-tone.md` is canonical. The cross-repo voice anchors (`pillar-interactions.ts`, `prompts.py`) are downstream consumers.
6. **No silent autonomy.** V1 has no daemons, no background agents, no auto-accept. Every state change is either a human edit at the layer that owns the file, or a queued proposal that passes through `accept.sh` / `reject.sh`.
7. **BBC is AGPLv3, free, and OSS-first.** See `LICENSE` at the repo root + ADR-0007. The project takes no revenue in v1: no Stripe, no paywall, no credit metering, no commercial license clauses. Users self-host (or use a hosted demo paid for as a marketing expense) and bring their own provider keys (BYOK). Commercial relicensing is **deferred**, not foreclosed — AGPL is chosen precisely so that the maintainer retains the option to sell a hosted/enterprise license later (the Cal.com / Plausible playbook). Any change to this principle requires a new ADR superseding ADR-0007.

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
