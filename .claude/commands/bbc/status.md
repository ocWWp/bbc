---
name: bbc:status
description: Show current layer + pending queue + recent accepts/rejects in the active tenant repo
allowed-tools:
  - Read
  - Bash
---

<objective>
Give the user situational awareness inside BBC at a glance. What layer am I in? What proposals are pending? What just got accepted or rejected? What's in this leaf's local notes?

This is the first thing any agent should run when entering a BBC session.

Operates against the **active tenant repo** — that's `$BBC_REPO` if set, otherwise the dir of the current shell (so `cd` into your tenant repo before invoking, or set `BBC_REPO`).
</objective>

<process>
1. Resolve `<tenant>` = `${BBC_REPO:-$PWD}`. Print which it is.

2. Detect current layer (run from `<tenant>`):
   ```bash
   layer=$(bash <bbc>/scripts/which-layer.sh)   # <bbc> = path to the BBC product repo
   ```

3. Print a header with layer and timestamp.

4. List pending queue items (top of `<tenant>/queue/`, excluding `_accepted/`, `_rejected/`, and `README.md`). For each, extract `proposal_id`, `proposed_by`, `target_layer`, `target_file`, `change_kind`, `diff_summary`, and whether it has a `manager_review:` block yet. Print as a compact table. **If empty, print `(none)` on its own line.**

5. Show the 5 most recent `<tenant>/queue/_accepted/*.md` (sorted by filename, descending — filenames are ISO-8601 timestamp-prefixed, so descending == newest first). Print: id, target_file, accepted_at. **If empty, print `(none)`.**

6. Show the 5 most recent `<tenant>/queue/_rejected/*.md` similarly. Print: id, rejection_reason. **If empty, print `(none)`.**

7. If `layer` starts with `leaf:`, also list contents of that leaf's `local/` directory (pre-promotion notes). **If empty, print `(local/ is empty)`.**

8. Surface anything anomalous:
   - A proposal in `queue/` with `status: accepted` or `rejected` but still in the top-level (means a previous accept/reject failed midway).
   - A proposal where `manager_review.verdict: approved` but it's still pending (ready for `/bbc:accept`).

Output format: terse, scannable. No markdown headers nested deeper than two levels.

Do NOT modify anything. Read-only command.
</process>

<example_output>
```
=== BBC status — tenant: /Users/you/Documents/GitHub/your-tenant ===
Layer: leaf:web
Time:  2026-05-09T10:00:00Z

Pending (1):
  prop_2026-05-09T09-30-12Z_leaf-…_voice-clarity   manager_review: ✓ approved   target: memory/design/voice-tone.md
    → ready for /bbc:accept

Recent accepts (top 3):
  prop_2026-05-09T08-37-57Z_…_add-provenance-term-to-glossary  → memory/glossary/terms.md
  …

Recent rejects (top 0):
  (none)

Leaf-local notes (1):
  local/scratch-resend-rate-limit.md  (untracked)
```
</example_output>
