# F4-build-3 — Decommission Rehearsal: mobbin (SUMMARY)

## Status

**Complete (2026-05-08).** Full Announce → Quarantine → Purge cycle exercised against `mobbin` (pattern-reference role). Audit trail intact. Three real gaps found in the decommission machinery.

## Timeline (compressed for rehearsal)

| Step | Action | Result |
|---|---|---|
| Pre | Verified mobbin status: active, 0 consumer-code tag occurrences | Clean baseline |
| Announce v1 | Filed proposal flipping status + adding sunset_date | **REJECTED** — diff had hallucinated body context lines, patch partial-applied |
| Cleanup | Reverted partial mutation manually; rejected the broken proposal with reason | Audit trail preserved in `_rejected/` |
| Announce v2 | Re-filed with corrected single-hunk diff | Approved → accepted; mobbin status: deprecated |
| Quarantine | `grep -rn "bbc-provider:mobbin"` across consumer repos | 0 occurrences; no work |
| Purge 3a | Filed proposal: bindings.yaml `pattern-reference: mobbin` → `(unbound)` | Approved → accepted |
| Purge 3b | Direct Main edit: `status: deprecated` → `archived` (workaround for accept.sh limitation — see Finding #2) | Manual edit; documented as gap |
| Purge 3c | Manual `mv mobbin.yaml _archived/mobbin.yaml` (workaround for accept.sh limitation — see Finding #3) | File moved |
| Purge 3d | Authored ADR-0003 documenting the decommission lifecycle | Direct write at Main |
| Validate | `bash scripts/validate-providers.sh` | clean ✓ (only the prior posthog warnings remain; nothing new broke) |

## Findings (real gaps surfaced by running the protocol)

### Finding #1 — Multi-hunk patch partial-apply

**Symptom.** Announce v1 had a unified diff with two hunks. The first added 3 lines (sunset_date, decommission_reason, replacement_provider_id). The second tried to flip `status: active` → `deprecated`. After the first hunk applied, the second hunk's claimed line numbers were now stale, and patch couldn't find context. **First hunk persisted; second failed; target file left in partial state.**

Diagnosis: my v1 diff also had hallucinated context (lines that weren't actually in the body) which exacerbated the failure. Even with correct context, multi-hunk diffs that mutually shift line numbers can fail.

**Recommended fix:** `accept.sh apply_edit()` should either:
- Use `patch --dry-run` to validate ALL hunks first, then apply (atomic from caller's perspective).
- Wrap apply in a transaction: copy target → apply patch → if failed, restore copy.

Currently when patch fails, `accept.sh` exits with the file partially modified and leaves a `.rej` file. The `.rej` files were addressed in F4-build-1 (`--no-backup-if-mismatch`) but multi-hunk partial-apply is a separate issue.

**Workaround for now:** authors should prefer single-hunk diffs when modifying multiple parts of a file's frontmatter.

### Finding #2 — `accept.sh apply_supersede` sets `status: superseded`, not `archived`

**Symptom.** F4 design's adapter status enum is `candidate | active | deprecated | archived`. But `accept.sh apply_supersede()` sets `status: superseded`, which isn't in that enum. Using `change_kind: supersede` to archive an adapter would have produced an out-of-schema status value.

**Recommended fix:** parameterize the terminal-status string. For `type: provider-adapter`, use `archived`. For other memory entry types, keep `superseded`. Or introduce a dedicated `change_kind: archive` for adapters.

**Workaround used:** filed a regular `change_kind: edit` flipping status to `archived` via direct Main action.

### Finding #3 — No mechanism to MOVE files via the queue protocol

**Symptom.** F4 design §3 step 3 explicitly says: "the file MOVES from `memory/ops/providers/<id>.yaml` to `memory/ops/providers/_archived/<id>.yaml`". Neither `accept.sh apply_edit()` nor `apply_supersede()` supports moves. Manual `mv` was required.

**Recommended fix:** introduce `change_kind: move` (or `archive` for the specific case). The proposal would name `target_file` (source) and add a `dest_file:` frontmatter field. `accept.sh` would then `git mv`-style relocate + update any provenance.

**Workaround used:** manual `mv` after status flip.

### Finding #4 (carried forward) — `provider-adapter` archived locations need indexing too

The `_archived/mobbin.yaml` is invisible to `validate-providers.sh` (the script explicitly excludes `_archived` from the active adapter set). But there's no separate index of archived adapters. A future operator wondering "have we ever decommissioned X?" must list directory contents. A `memory/ops/_archive-index.md` (auto-generated like `_index.md`) would help.

## Files changed in this phase

- `memory/ops/providers/mobbin.yaml` — status flipped to `archived`, then file moved.
- `memory/ops/providers/_archived/mobbin.yaml` — created (mv target).
- `memory/ops/bindings.yaml` — `pattern-reference` row updated to `(unbound)`.
- `memory/decisions/0003-decommission-mobbin.md` — new ADR documenting the cycle.
- `queue/_accepted/` — 2 accepted proposals from this rehearsal (announce v2, unbind).
- `queue/_rejected/` — 1 rejected proposal (announce v1, broken diff).
- `_log/operations.jsonl` — 8+ log entries from this phase's writes.

## Schema gaps caught

- The `accept.sh apply_edit()` function is non-atomic across hunks. (Finding #1)
- The supersede→status mapping has the wrong target word for adapters. (Finding #2)
- No file-move support in the queue protocol. (Finding #3)
- No archive index. (Finding #4)

These four findings inform F4-build-4 (slash commands), which should compose around fixed primitives — not paper over these gaps in UX.

## Next

F4-build-4 — `/bbc:decommission` + `/bbc:bind` slash commands. Should call out the three findings above as prerequisites or explicitly script around them with `mv` and direct edits until accept.sh is upgraded.
