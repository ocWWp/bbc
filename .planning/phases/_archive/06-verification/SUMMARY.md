# Phase 06 — Summary

## Status

**PASS — 5-step walkthrough completed via subagent-simulated multi-session test on 2026-05-08.**

Three fresh general-purpose agents (each with no prior context) played the leaf-propose, manager-review, and leaf-verify roles. The human (orchestrator) ran `accept.sh` between steps 3 and 4. Closed loop with full audit trail.

## Artifacts

- `PLAN.md` — the 5-step walkthrough.
- This file.

## What was proven during construction (script-level)

- `scripts/index-memory.sh` regenerates byte-identical output across consecutive runs.
- `scripts/propose.sh` correctly infers originator from `$PWD` when run inside `distribution/<leaf>/`.
- `scripts/accept.sh` validates `manager_review.verdict: approved`, applies a unified diff, updates target frontmatter (`updated:`, `provenance:`), and archives the proposal.
- `scripts/bootstrap-leaf.sh` is idempotent (consecutive runs → byte-identical CLAUDE.md).

## What still requires human verification

(Resolved via subagent simulation — see below.)

## Findings from the agent walkthrough

### Per-step results

| Step | Actor | Result |
|---|---|---|
| 1 | Agent A (fresh leaf) | Bootstrapped: leaf CLAUDE → Main CLAUDE → Manager CLAUDE → memory. Cited 3 of 6 Main principles with correct file path. |
| 2 | Agent A (continued) | Created proposal `prop_2026-05-08T08-26-40Z_…_no-emojis-in-marketing-copy` via `propose.sh`. Did not edit target. |
| 3 | Agent B (fresh manager) | Bootstrapped: manager CLAUDE → Main CLAUDE → all 3 rules → queue → target. Verdict `approved`. Correctly added `cross_leaf_impact:` block (target is in the cross-leaf table). Correctly omitted `promotion_check:` (kind=edit, not add). |
| 4 | Human (`accept.sh`) | Diff applied. Target frontmatter updated (`updated:`, `provenance:`). Proposal archived to `_accepted/`. Index regenerated. |
| 5 | Agent C (fresh leaf) | Read the new rule verbatim from `memory/design/voice-tone.md`. Cited correct provenance proposal id and the post-accept `updated:` timestamp. |

### Issues raised by the agents (worth fixing or considering)

1. **`propose.sh` doesn't capture an explicit `source:` field.** The proposal-review rule asks proposers to "cite at least one source: a leaf observation, a human directive, an external link." Agent B treated `proposed_by: leaf:<name>` as an implicit source but flagged that a stricter manager could request changes. → Recommend: add `--source` flag to `propose.sh`, default to `proposed_by` if omitted but encourage explicit citation.
2. **Auto-header paraphrases Main principles.** The bootstrap header summary in each leaf's CLAUDE.md condenses the 6 Main principles into a paraphrased list. Agents had to verify against `bbc/CLAUDE.md` for exact wording. Acceptable for V1 (header is a hint, not the source of truth) but drift risk grows over time. → Recommend: have `bootstrap-leaf.sh` extract principles verbatim from `bbc/CLAUDE.md` rather than maintain a paraphrase.
3. **`propose.sh` requires running from inside the leaf directory** for `--originator` inference. Worked correctly but trips up automation. → Already documented in the script header; consider also documenting in `queue/README.md`.
4. **Empty `local/`** in the stub leaf — expected (it's a stub) but worth noting in the README that this is intentional.
