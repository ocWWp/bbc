# Phase 09 — Flagged Fixes from Phase 08 (SUMMARY)

## Status

**Complete (2026-05-08).** All three flagged issues from the Phase 08 walkthrough closed. Self-tested end-to-end; residue archived.

## What changed

### Issue 1 — Lock matrix contradiction (Main edit, ADR-gated)

**Problem.** Main's lock matrix said `queue/**` was editable only by `propose.sh`/`accept.sh`/`reject.sh`. But Manager's documented review protocol (in `manager/CLAUDE.md`, `manager/agents/queue-reviewer.md`, `manager/rules/proposal-review.md`) required Manager to append `manager_review:`, `cross_leaf_impact:`, and `promotion_check:` blocks directly to pending proposal files. The matrix forbid what the rest of the system required.

**Fix.** Authored `memory/decisions/0002-manager-can-annotate-queue.md` (ADR) capturing the decision and reasoning. Then applied the ADR's prescribed lock-matrix change in `bbc/CLAUDE.md`:

The single `queue/**` row was split into three:

| Path | Direct writes | Via queue |
|---|---|---|
| `queue/*.md` (proposal body + `propose.sh`-written frontmatter fields) | scripts only | n/a |
| `queue/*.md` review annotation blocks (`manager_review:` etc.) | Manager session | n/a (ADR-0002) |
| `queue/_accepted/**`, `queue/_rejected/**` | scripts only — immutable once archived | n/a |

The leaf bootstrap header is unaffected (it inlines only the `Precedence rule` and `Non-negotiable principles` sections, not the lock matrix).

### Issue 2 — Patch warnings leaked to stderr but were swallowed by `--silent`

**Problem.** `accept.sh` ran `patch -p1 --silent --no-backup-if-mismatch` and didn't redirect stderr. When a diff hunk header overshoots the file's line count, `patch` prints `No such line N in input file, ignoring` to stderr but still applies correctly. The warning leaked, looking like a partial failure even though the apply succeeded.

**Fix.** `apply_edit()` now captures patch's stderr to a temp file. After patch exits:
- If stderr is non-empty, the warnings print under a clear `patch warnings:` header (indented 2 spaces) — the user sees them and can decide whether to follow up, but the apply isn't blocked.
- If patch's exit code is non-zero, the script aborts with the captured warnings as context.
- Switched the heredoc piping from `echo "$diff"` to `printf '%s\n' "$diff"` so the trailing newline is guaranteed regardless of input shape.

### Issue 3 — `accept.sh --dry-run` flag

**Problem.** Without a dry-run path, a malformed diff applied with only an advisory warning could mutate a memory file before the human noticed.

**Fix.** Added `--dry-run` flag. When set:
- All validation runs (proposal lookup, frontmatter parse, manager_review.verdict check).
- For `change_kind: edit`: `patch --dry-run` runs against the target. Patch warnings still surface.
- For `change_kind: add`: validates the markdown fence + non-existence of target.
- For `change_kind: supersede`: validates target exists.
- **No mutations.** Target file untouched. Proposal stays in `queue/` with `status: pending`. Index not regenerated.
- Final line: `DRY RUN: <id> would be applied to <file>  (no files modified)`.

CLI flag parser now handles `--force` and `--dry-run` independently and in any order.

`accept.md` runbook updated to recommend running `--dry-run` first and surfacing any `patch warnings:` block before the real run.

## Files changed

- `memory/decisions/0002-manager-can-annotate-queue.md` — new ADR.
- `bbc/CLAUDE.md` — lock matrix split, three rows where there was one.
- `scripts/accept.sh` — patch stderr capture/surfacing; `--dry-run` flag; arg parser.
- `.claude/commands/bbc/accept.md` — runbook now mentions `--dry-run` and the `patch warnings:` block.

## Self-test (2026-05-08)

- Filed sham proposal `prop_…_phase-09-dry-run-test`.
- Ran `accept.sh ... --dry-run`. Verified: glossary unchanged, proposal still pending, `_accepted/` empty, exit 0.
- Ran `accept.sh ...` for real. Verified: glossary updated with sentinel row, frontmatter `provenance:` populated, proposal archived.
- Reverted glossary, moved sham proposal to `.test-archive/`, regenerated index.

## Issues NOT addressed (deferred)

- `accept.md` `<refusal_examples>` not labeled by trigger condition (cosmetic).
- `accept.sh` `fm()` awk parser doesn't handle single-quoted or multi-line YAML scalars (no current proposals trigger this; defer).
- `queue-reviewer.md` `model: sonnet` vs `subagent_type: general-purpose` naming (clarity only).
- Software-enforcement of ADR-0002's annotation-only restriction (e.g., a hook that rejects non-annotation writes to `queue/**`). Out of scope for V1.
