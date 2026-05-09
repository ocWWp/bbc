# Phase 07 — Polish

## Status

**Complete (2026-05-08).** All three gaps surfaced by the Phase 06 agent walkthrough are fixed and verified end-to-end.

## Changes

### 1. `propose.sh` — `--source` flag

`scripts/propose.sh` now accepts `--source "<citation>"`. The value is written into the proposal's frontmatter as `source:`, satisfying `manager/rules/proposal-review.md`'s requirement that proposals cite a leaf observation, human directive, or external link.

When `--source` is omitted, propose.sh prints a warning and falls back to a weak default (`<proposed_by> observation (no explicit source cited)`). Manager may `changes_requested` such proposals.

### 2. `bootstrap-leaf.sh` — verbatim extraction

The auto-managed header in every leaf's `CLAUDE.md` no longer paraphrases Main's `## Precedence rule` and `## Non-negotiable principles` sections. It extracts both verbatim from `bbc/CLAUDE.md`. Drift between Main and the leaf summary is now impossible by construction.

If those headings are missing or renamed in `bbc/CLAUDE.md`, `bootstrap-leaf.sh` errors loudly rather than silently producing a degraded header.

### 3. `queue/README.md` — invocation docs

Added an "How to invoke `propose.sh`" section showing the two valid call patterns (cd into leaf directory vs. pass `--originator` from repo root). Added a note on the new `source:` field.

## Verification

- `bootstrap-leaf.sh` re-run on `8azi-web-stub` produces a header whose principles match `bbc/CLAUDE.md` byte-for-byte.
- Two consecutive runs are byte-identical (idempotency preserved).
- `propose.sh --source` records the citation; `propose.sh` without `--source` emits a warning and applies the default.
- Existing accepted proposal in `queue/_accepted/` (from Phase 06) is unaffected.

## Files changed

- `scripts/propose.sh` — `--source` flag, header docs.
- `scripts/bootstrap-leaf.sh` — `extract_section()` helper, verbatim header generation, blank-line preservation, precise wording about what is and isn't inlined.
- `queue/README.md` — `source:` frontmatter field, invocation patterns section.
- `manager/rules/proposal-review.md` — `source` added to well-formed checklist; weak-default explicitly called out as `changes_requested` reason.
- `distribution/8azi-web-stub/CLAUDE.md` — regenerated header (verbatim Main sections).

## Second-pass agent walkthrough (2026-05-08)

After the initial three fixes, ran another 3-subagent walkthrough as a regression check. The new agents found three further sub-issues in the polish itself:

1. **Missing blank line before `## Non-negotiable principles`** — `$()` command substitution stripped trailing newlines from `extract_section`, so concatenated Main sections ran into each other. Fixed by adding an explicit blank line in the `bootstrap-leaf.sh` heredoc.
2. **`--source` shown as required in leaf header but optional in `propose.sh`** — fixed by bracketing `[--source ...]` in the heredoc to match the script's actual semantic.
3. **`proposal-review.md` "well-formed" checklist didn't list `source`** — out of sync with `queue/README.md`. Added.

Plus one wording-precision fix:

4. The auto-header originally said "Sections below are extracted verbatim from `bbc/CLAUDE.md`" — but only two sections are inlined, not all of Main. Tightened to name the two sections explicitly and direct readers to `bbc/CLAUDE.md` for the rest.

After all fixes, the closed-loop end-to-end test (Provenance term added to glossary) passed:
- Agent A1 bootstrapped, used `--source` explicitly, created a well-formed proposal.
- Agent B1 reviewed, approved, added `cross_leaf_impact:`, explicitly noted the source citation was satisfactory.
- Human ran `accept.sh`; the new term appeared in `memory/glossary/terms.md` with correct `provenance:`.
- Agent C1 (fresh leaf) found the new term and traced its provenance end-to-end (glossary frontmatter → archived proposal → originating leaf + source citation).
