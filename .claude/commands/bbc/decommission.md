---
name: bbc:decommission
description: Walk a provider through Announce → Quarantine → Purge (Manager-initiated, Main-accepted)
allowed-tools:
  - Read
  - Bash
  - Edit
  - Write
---

<objective>
Orchestrate a provider decommission through the F4 three-phase lifecycle: Announce → Quarantine → Purge. Used when a vendor must be replaced (cost change, policy violation, vendor death, quality regression).

This command does NOT batch all three phases into one go. Each phase is a separate user action with explicit confirmation. The runbook is the orchestrator; the user is the decision-maker.

Operates against the **active tenant repo** (`$BBC_REPO` or current dir). The provider adapter YAML being decommissioned lives in `<tenant>/memory/ops/providers/<id>.yaml`.
</objective>

<process>
1. Detect layer (run from tenant cwd):
   ```bash
   layer=$(bash <bbc>/scripts/which-layer.sh)   # <bbc> = path to BBC product repo
   ```
   Refuse unless `layer == manager` (initiator) or `layer == main` (accepter). Print: "Run `/bbc:decommission` from `<tenant>/manager/` to file the announce, or from `<tenant>/` root to accept a phase."

2. Get the provider id from the user. Validate it exists at `<tenant>/memory/ops/providers/<id>.yaml`. If it's already in `_archived/`, refuse with: "Provider `<id>` is already archived."

3. Determine the current phase by reading the adapter's `status:`:
   - `active` → next action is Announce.
   - `deprecated` → next action is sweep (Quarantine status check), then Purge.
   - `archived` → already done.

4. **If next action is Announce:**
   - Ask the user for `decommission_reason` and proposed `sunset_date` (default: today + 30 days).
   - Construct a single-hunk unified diff that flips `status: active` → `status: deprecated` AND adds the three fields (`sunset_date`, `decommission_reason`, `replacement_provider_id: tbd`). Critical: ONE HUNK to avoid the F4-build-3 Finding #1 partial-apply issue.
   - Run propose.sh from `bbc/manager/` with `--target main --kind edit --source "<user-cited reason>"`.
   - Tell user the proposal_id and to run `/bbc:review` next, then `/bbc:accept`.

5. **If status is `deprecated` and user is sweeping (Quarantine):**
   - Run `grep -rn "bbc-provider:<id>" <consumer-repo-paths>` against every leaf's repo path declared in `memory/ops/providers/<id>.yaml` Runtime section.
   - Print the count per leaf + a list of files still tagged.
   - If count > 0: tell user to file follow-up proposals against each leaf to replace the tagged code. Exit (Quarantine work in progress).
   - If count == 0: confirm "Quarantine clean — no consumer-code work remaining. Proceed to Purge? [y/N]"

6. **If proceeding to Purge:**
   - Sub-step (a): file a queue proposal flipping bindings.yaml's binding for this provider's role to `(unbound)` (or to a replacement if user supplies one).
   - Sub-step (b): file ONE `change_kind: archive` proposal — `target_file: memory/ops/providers/<id>.yaml`, `dest_file: memory/ops/providers/_archived/<id>.yaml`. Body is a free-form archive rationale citing the announce ADR.
   - Sub-step (c): file a queue proposal authoring a new ADR `memory/decisions/<NNNN>-decommission-<id>.md` with `change_kind: add`.

   The previous workaround (manual `mv`) is no longer needed — `change_kind: archive` (introduced post F4-build-3) handles the move atomically through the queue protocol. Sub-steps (b) and (c) are independent proposals; either order works.

7. After each step, print the next concrete action the user should take. Never autonomously chain across steps without confirmation.

## Refusal examples

- "/bbc:decommission must run from `bbc/manager/` (initiate) or repo root (accept)."
- "Provider `<id>` is already archived."
- "Quarantine sweep finds N consumer-code occurrences. Replace those before Purge."
- "Cannot autonomously file a Purge proposal while Announce is still pending."
</process>

<known_limitations>
The four F4-build-3 findings have all been closed (post-rehearsal polish):
- Finding #1 (multi-hunk partial-apply): `accept.sh apply_edit()` now runs `patch --dry-run` first; aborts cleanly if any hunk fails. Multi-hunk diffs are now atomic.
- Finding #2 (supersede sets wrong status name for adapters): `accept.sh apply_supersede()` now reads target's `type:` field; `provider-adapter` → `archived`, else `superseded`.
- Finding #3 (no file-move support): `change_kind: archive` introduced. This command's Purge step uses it directly.
- Finding #4 (no archive index): `scripts/index-archives.sh` produces `memory/ops/_archive-index.md` listing all archived providers.

These workarounds will be removed when the underlying scripts are upgraded (future build phase).
</known_limitations>
