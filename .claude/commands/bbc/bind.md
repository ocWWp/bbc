---
name: bbc:bind
description: Bind an adapter to a role (or change an existing binding) via queue
allowed-tools:
  - Read
  - Bash
  - Edit
---

<objective>
Update the active **tenant repo's** `memory/ops/bindings.yaml` to bind a role to an active adapter. Used when:
- A previously unbound role gets its first adapter (e.g., binding `image-edit-provider` to a new candidate).
- A role's binding changes from one adapter to another (vendor swap).
- A provisional binding flips to permanent.

This command does NOT activate adapters or run the F1 ranker. It records the binding decision after the human (or future ranker) has made it.

Operates against `$BBC_REPO` or current dir. Role contracts live in the BBC product repo at `<bbc>/memory/ops/provider-roles/`; tenant adapter declarations live in `<tenant>/memory/ops/providers/`.
</objective>

<process>
1. Detect layer (run from tenant cwd). Refuse unless `layer == manager` or `layer == main`.

2. Ask the user for:
   - `--role <role-id>` — must exist at `<bbc>/memory/ops/provider-roles/<role>.yaml` (BBC product repo defines the role contracts).
   - `--provider <provider-id>` — must exist as an `active` adapter at `<tenant>/memory/ops/providers/<id>.yaml`. Refuse if status is `candidate` (caller must promote to active first via separate proposal), `deprecated` (use `/bbc:decommission` instead), or `archived` (impossible).

3. Validate that the named adapter declares `implements: [<role-id>]`. Refuse with: "Adapter `<provider>` does NOT implement role `<role>`. Update the adapter's `implements:` field first via a separate proposal."

4. Read the current binding for the role from `memory/ops/bindings.yaml`. Determine the diff:
   - If currently `(unbound)` → adding a binding.
   - If currently bound to a different active provider → swap (with implicit decom expectation; warn user to consider `/bbc:decommission` for the replaced one).
   - If currently bound to the same provider → no-op; print message and exit.

5. Construct a single-hunk diff against `bindings.yaml` updating the row for the role.

6. File a queue proposal via `propose.sh`:
   - `--target main --file memory/ops/bindings.yaml --kind edit --source "<user-cited reason or pick_trace ref>"`.

7. If F1's `rank.sh` produced a `pick_trace` for this binding, attach the trace as evidence in the proposal body alongside the diff. Manager review will check the trace against the profile's hard constraints.

8. Print the proposal_id. Tell user: "Manager review next, then `/bbc:accept` to apply."
</process>

<refusal_examples>
- "/bbc:bind must run from `bbc/manager/` or repo root."
- "Role `<role>` does not exist."
- "Adapter `<provider>` is `candidate` — promote to `active` first."
- "Adapter `<provider>` does not declare `implements: [<role>]`."
- "Role `<role>` is already bound to `<provider>` (no change)."
- "Replacing `<old>` with `<new>` — recommend running /bbc:decommission for `<old>` separately."
</refusal_examples>

<known_limitations>
- Provisional bindings are still recorded with the parens hack `(provisional: <id>)` per F4-build-1 SUMMARY gap #4. A future schema upgrade adds a `provisional: true` flag.
- This command does NOT call `rank.sh` itself. F1-build-4 (binding-update integration) will compose `/bbc:bind` with the ranker.
</known_limitations>
