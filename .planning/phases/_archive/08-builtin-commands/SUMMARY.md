# Phase 08 — Built-in `/bbc:*` Commands (SUMMARY)

## Status

**Verified (2026-05-08).** Six essential slash commands implemented + layer detection + install script + settings.json allowlist + 3-subagent acceptance walkthrough passed.

## Files added

```
bbc/.claude/
├── commands/bbc/
│   ├── help.md
│   ├── status.md
│   ├── propose.md
│   ├── review.md
│   ├── accept.md
│   └── bootstrap-leaf.md
└── settings.json                    # bash-script allowlist

bbc/scripts/
├── which-layer.sh                   # shared layer-detection helper
└── install-skills.sh                # symlink installer (idempotent)
```

## How it works

When a Claude session is opened in or under `bbc/`, the project-local `.claude/commands/bbc/*.md` files are discovered automatically. The user invokes them as `/bbc:help`, `/bbc:status`, etc.

For global access (commands available anywhere), run:

```bash
bash bbc/scripts/install-skills.sh
```

That symlinks `bbc/.claude/commands/bbc` → `~/.claude/commands/bbc`. The installer is idempotent and refuses to overwrite a non-symlink.

## Layer detection

Every command first runs:

```bash
layer=$(bash bbc/scripts/which-layer.sh)
```

Returns one of `main`, `manager`, `leaf:<name>`, `unknown`. Commands refuse with a clear message when invoked from the wrong layer (e.g., `/bbc:accept` only runs from `main`).

## Skill bodies

Each command's markdown contains:

- `<objective>` — when the command applies, what it produces.
- `<process>` — the step-by-step Claude follows. Wraps an existing tested bash script; doesn't re-implement logic.
- `<refusal_examples>` (where relevant) — exact messages to give for wrong-layer or wrong-state invocations.

## Verification — passed 2026-05-08

Three blind subagents exercised the loop end-to-end. Test scenario: add "Audit trail" as a glossary term.

| Step | Agent | Layer | Result |
|---|---|---|---|
| 1 | A1 | leaf:8azi-web-stub | `/bbc:status` produced clean baseline output. `/bbc:accept` correctly identified as refusal-required from leaf (quoted runbook clause). `/bbc:propose` produced well-formed proposal with explicit `--source`. |
| 2 | B1 | manager | `/bbc:review` triaged the proposal. Verdict `approved`. Appended `manager_review:` AND `cross_leaf_impact:` (correctly identified glossary as cross-leaf shared file). Did not move file or edit target. |
| 3 | C1 | main | `/bbc:accept` previewed the proposal, applied it via `accept.sh`, archived to `_accepted/`, regenerated index. Side-effects verified: target frontmatter gained `updated:` + `provenance:`. |

Then the human (orchestrator) cleaned up: glossary reverted, walkthrough proposal moved to `.test-archive/`. Final state: identical to pre-walkthrough seed.

## Issues surfaced + actioned

The walkthrough surfaced 11 issues. 5 were doc-tightening fixable inside `.claude/commands/bbc/` and `manager/agents/`; fixed in same session.

**Fixed:**
- `review.md` body referenced "Agent" tool but allowed-tools listed canonical name `Task`. Body fixed to match.
- `queue-reviewer.md` only knew about `proposal-review.md`, missing the cross-leaf-impact and promotion-check delegation. Added explicit instruction pointing at `leaf-coordinator.md` and `memory-curator.md` schemas.
- `propose.md` step 4 path template `<layer-dir>/<leaf-dir-if-leaf>` glossed over leaf-vs-manager depth asymmetry (`../../scripts` vs `../scripts`). Split into two explicit code blocks.
- `status.md` did not prescribe empty-state behavior; agent had to infer `(none)`. Now explicit per section.
- `accept.md` step 4 hard-coded interactive `[y/N]` confirmation incompatible with autonomous-mode invocations. Added autonomous-path: if the user's invoking request already named the proposal_id explicitly, treat it as confirmation and log the quote.

**Flagged for human (not autonomously fixed):**
- **Lock matrix in `bbc/CLAUDE.md` says `queue/**` is editable only by `propose.sh`/`accept.sh`/`reject.sh`**, but Manager has to append `manager_review:` / `cross_leaf_impact:` / `promotion_check:` annotation blocks. Real contradiction — Manager's normal operation mutates `queue/**` outside the script set. Needs a Main-layer edit to carve out an explicit Manager-annotation exception, gated behind an ADR per Main's own change protocol.
- **`accept.sh` patch warning leakage**: `patch --silent` still prints `No such line N in input file, ignoring` to stderr when a hunk header overshoots the file. The patch still applies correctly, but the warning is visible. Two options: (a) suppress stderr entirely (risk: hide real errors); (b) treat any patch warning as a hard fail (forces proposers to author exact hunks). Default current behavior is (a) but unintentionally.
- **`accept.sh` has no `--dry-run`**, so a malformed diff applies with only a stderr warning. Worth adding for safety.

**Minor (deferred):**
- `accept.md` `<refusal_examples>` not labeled by trigger condition.
- `accept.sh` `fm()` awk parser doesn't handle single-quoted or multi-line YAML scalars.
- `queue-reviewer.md` frontmatter `model: sonnet` vs review.md `subagent_type: general-purpose` — different concerns, naming clarity could improve.

## Out of scope (deferred)

- `/bbc:reject`, `/bbc:promote`, `/bbc:health` — V1.1 once the essentials prove out.
- `/bbc:init` — bootstrapping a brand-new BBC repo for a new org. Big enough to deserve its own phase.
- `/bbc:diff` — show what a pending proposal would change. Useful but optional.
- Telemetry — how often each command fires, by whom. Pure observability.
