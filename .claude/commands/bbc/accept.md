---
name: bbc:accept
description: Apply an approved proposal to its target file (Main only)
allowed-tools:
  - Bash
  - Read
---

<objective>
Apply a proposal that Manager has approved. Wraps `bbc/scripts/accept.sh` with confirmation, layer-checking, and human-readable summary.
</objective>

<process>
1. Detect layer:
   ```bash
   layer=$(bash bbc/scripts/which-layer.sh)
   ```
   Refuse unless `layer == main`. /bbc:accept is the Main-only path. (For dev/test override, the underlying script accepts `--force`, but the slash command itself does not expose it.)

2. Resolve the proposal id:
   - If the user gave a proposal_id or filename, use it.
   - Otherwise, list pending proposals where `manager_review.verdict: approved` and ask the user which one.

3. Show a one-screen preview before applying:
   - proposal_id
   - target_file
   - change_kind
   - diff_summary
   - source
   - manager_review.notes
   - the actual diff/add body (read from the proposal file)

4. Confirm before applying:
   - **Interactive (default):** ask "Apply this to <target_file>? [y/N]" and proceed only on explicit `y`/`yes`.
   - **Autonomous (auto mode or scripted invocation):** if the user's original request to invoke `/bbc:accept` already named the proposal_id (or a unique identifying substring) and explicitly asked you to apply it, treat that request as the confirmation and skip the prompt. Log "Applying per user request: <quote of the relevant words>" before running accept.sh.
   - **Refuse if neither path is satisfied.** Don't guess; print what's missing.

5. (Optional but recommended) Run a dry run first to validate the diff applies cleanly without mutating anything:
   ```bash
   cd bbc && bash scripts/accept.sh <proposal_id> --dry-run
   ```
   If the dry run prints any `patch warnings:` block, surface them in your output before the real run. They don't block apply, but the user should see them — they often signal an imprecise hunk header in the original proposal.

6. Run accept.sh for real from the BBC repo root:
   ```bash
   cd bbc && bash scripts/accept.sh <proposal_id>
   ```

7. Report:
   - Whether the script succeeded (exit 0).
   - Any `patch warnings:` lines (advisory; apply still succeeded if exit 0).
   - The target file's new `updated:` timestamp and `provenance:` list.
   - The archive path in `queue/_accepted/`.
   - If `cross_leaf_impact.followups_required: true` is in the proposal, list the leaves that need follow-up updates.

If accept.sh fails (exit non-zero), print its error verbatim. Do NOT retry, do NOT `--force`, do NOT manually patch the target file. Hand it back to the user.
</process>

<refusal_examples>
- "/bbc:accept runs from Main only. cd to the BBC repo root."
- "This proposal hasn't been reviewed yet (no manager_review block). Run /bbc:review first."
- "manager_review.verdict is 'changes_requested', not 'approved'. The proposer needs to revise the proposal."
</refusal_examples>
