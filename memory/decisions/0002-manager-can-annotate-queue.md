---
id: mem_2026-05-08_adr-0002-manager-queue-annotations
type: decision
scope: org
layer: main
source: human:zeth
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
owning_layer: main
tags: [adr, bbc, lock-matrix, manager, queue]
status: accepted
---

# ADR-0002: Manager may append review annotation blocks to queue files

## Context

The original lock matrix in `bbc/CLAUDE.md` (Phase 03) said:

| `queue/**` | `propose.sh`, `accept.sh`, `reject.sh` only | n/a |

Phase 08's subagent walkthrough surfaced that this contradicts how Manager actually operates: Manager's review protocol (defined in `manager/CLAUDE.md`, `manager/agents/queue-reviewer.md`, and the `manager/rules/*.md` files) requires Manager to append `manager_review:`, `cross_leaf_impact:`, and `promotion_check:` blocks to pending proposal files in `queue/`. The lock matrix forbids this; the rest of the system requires it.

## Decision

Manager sessions may directly edit pending proposal files in `queue/` for the **sole purpose** of appending review annotation blocks. The blocks are:

- `manager_review:` (always, when verdict is reached)
- `cross_leaf_impact:` (when target file is in the cross-leaf shared table or referenced from multiple leaves)
- `promotion_check:` (when `target_layer: main` AND `change_kind: add`)

All other mutations to `queue/**` remain restricted to `propose.sh`, `accept.sh`, and `reject.sh`. Specifically:

- Manager **may NOT** edit a proposal's body (the diff or content the proposer wrote).
- Manager **may NOT** edit existing frontmatter fields written by `propose.sh` (proposal_id, target_file, etc.).
- Manager **may NOT** move proposals to `_accepted/` or `_rejected/`.
- Manager **may NOT** edit files inside `_accepted/` or `_rejected/`. Once archived, proposals are immutable.

## Consequences

- The lock matrix in `bbc/CLAUDE.md` gets a new row distinguishing the proposal body (script-only) from review annotations (Manager + scripts). See ADR-driven edit applied alongside this file.
- `manager/CLAUDE.md` and `manager/agents/queue-reviewer.md` already match this decision; no further doc changes there.
- A future polish phase could enforce this in software (e.g., a pre-commit hook on `queue/**` that rejects edits outside the annotation blocks). Out of scope for V1; flagged only.

## Supersedes

n/a — this clarifies a gap in ADR-0001's lock matrix, not an opposing decision.

## Source

`/Users/grid/Documents/GitHub/bbc/.planning/phases/08-builtin-commands/SUMMARY.md` § "Issues surfaced"; subagent walkthrough 2026-05-08.
