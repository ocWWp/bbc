---
name: bbc:status
description: Show current BBC layer, pending queue items, and recent accepts/rejects
allowed-tools:
  - Read
  - Bash
---

<objective>
Give the user situational awareness inside BBC at a glance. What layer am I in? What proposals are pending? What just got accepted or rejected? What's in this leaf's local notes?

This is the first thing any agent should run when entering a BBC session.
</objective>

<process>
1. Detect current layer:
   ```bash
   layer=$(bash bbc/scripts/which-layer.sh)
   ```

2. Print a header with layer and timestamp.

3. List pending queue items (top of `queue/`, excluding `_accepted/`, `_rejected/`, and `README.md`). For each, extract `proposal_id`, `proposed_by`, `target_layer`, `target_file`, `change_kind`, `diff_summary`, and whether it has a `manager_review:` block yet. Print as a compact table. **If empty, print `(none)` on its own line.**

4. Show the 5 most recent `queue/_accepted/*.md` (sorted by filename, descending — filenames are ISO-8601 timestamp-prefixed, so descending == newest first). Print: id, target_file, accepted_at. **If empty, print `(none)`.**

5. Show the 5 most recent `queue/_rejected/*.md` similarly. Print: id, rejection_reason. **If empty, print `(none)`.**

6. If `layer` starts with `leaf:`, also list contents of that leaf's `local/` directory (pre-promotion notes). **If empty, print `(local/ is empty)`.**

7. Surface anything anomalous:
   - A proposal in `queue/` with `status: accepted` or `rejected` but still in the top-level (means a previous accept/reject failed midway).
   - A proposal where `manager_review.verdict: approved` but it's still pending (ready for `/bbc:accept`).

Output format: terse, scannable. No markdown headers nested deeper than two levels.

Do NOT modify anything. Read-only command.
</process>

<example_output>
```
=== BBC status ===
Layer: leaf:<tenant-app-web>-stub
Time:  2026-05-08T10:00:00Z

Pending (1):
  prop_2026-05-08T09-30-12Z_leaf-…_voice-clarity   manager_review: ✓ approved   target: memory/design/voice-tone.md
    → ready for /bbc:accept

Recent accepts (top 3):
  prop_2026-05-08T08-37-57Z_…_add-provenance-term-to-glossary  → memory/glossary/terms.md
  …

Recent rejects (top 0):
  (none)

Leaf-local notes (1):
  local/scratch-resend-rate-limit.md  (untracked)
```
</example_output>
