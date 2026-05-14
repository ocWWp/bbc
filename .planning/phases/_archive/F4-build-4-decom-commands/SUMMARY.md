# F4-build-4 — `/bbc:decommission` + `/bbc:bind` (SUMMARY)

## Status

**Complete (2026-05-08).** Two new slash commands shipped; `/bbc:help` updated to list them.

## Files

- `bbc/.claude/commands/bbc/decommission.md` — orchestrates Announce → Quarantine sweep → Purge as separate user-confirmed steps. Encodes the F4-build-3 workarounds (single-hunk diffs, `change_kind: edit` instead of `supersede` for status flips, prints `mv` command instead of executing).
- `bbc/.claude/commands/bbc/bind.md` — wraps a binding update via queue. Validates role exists, adapter exists and is `active`, adapter implements the role, then files a single-hunk diff against `bindings.yaml`.
- `bbc/.claude/commands/bbc/help.md` — updated to list the two new commands and their layer requirements.

## Design choices

- **No autonomous chaining.** `/bbc:decommission` does NOT run all three phases in one go. Each phase is a separate user action with explicit confirmation. This is intentional: vendor decisions are high-stakes and humans should see each step.
- **Workarounds documented in `<known_limitations>`** sections of each runbook. Future when `accept.sh` is upgraded (atomic patch, file-move support, archived-vs-superseded), these blocks shrink.
- **`/bbc:bind` does NOT call `rank.sh`.** Composition with F1's ranker is F1-build-4's job. For now, humans (or a future ranker invocation) decide; this command just records.

## Schema gaps still carried forward

The 4 findings from F4-build-3 are encoded as workarounds in `<known_limitations>`. They become removable when:
- `accept.sh` is made atomic across hunks → simplifies decommission's "always single-hunk" constraint.
- `change_kind: archive` (or fixed `supersede` for adapters) is added → /bbc:decommission step 6b becomes one proposal instead of an edit-then-mv.
- File moves are first-class → step 6c becomes part of the same proposal.

## Next

F2-build-3 + F2-build-4 — leaf specializations for skills + skill slash commands.
