---
name: bbc:bootstrap-leaf
description: Scaffold a new Distribution leaf, or refresh an existing one's auto-header
allowed-tools:
  - Bash
  - Read
---

<objective>
Wrap `bbc/scripts/bootstrap-leaf.sh` with a friendlier interface. Used for two cases:

1. **Create a new leaf** for a workstream (e.g., when adding `<<tenant-marketing>>` as a new repo BBC governs).
2. **Refresh an existing leaf** after Main's `Precedence rule` or `Non-negotiable principles` sections changed — the auto-header re-extracts them verbatim.

The script itself is idempotent; this command just adds context awareness.
</objective>

<process>
1. Get the leaf name from the user. Validate:
   - Lowercase, kebab-case, no slashes, no dots.
   - Not the reserved name `_template`.
   - Match the conventional pattern (`<<<tenant-app-web>>>`, `<<<tenant-app-api>>>`, `<<tenant-marketing>>`, etc.) where applicable.

2. Check whether `bbc/distribution/<name>/` already exists. Tell the user whether this is a create or a refresh.

3. Run the script from the BBC repo root:
   ```bash
   cd bbc && bash scripts/bootstrap-leaf.sh <name>
   ```

4. Report:
   - The new (or refreshed) leaf path.
   - The fact that `CLAUDE.md` now contains a verbatim copy of Main's Precedence rule and Non-negotiable principles between the auto-header markers.
   - Next steps the user typically wants:
     - For a new leaf: edit the lower section of its `CLAUDE.md` to fill in the repo path it shadows, leaf-specific commands, MCPs, and ownership rules.
     - For a refresh: nothing — the lower (human-edited) section is preserved.

5. If the user is creating a leaf for an existing tenant repo (web, api, market), suggest they queue M1/M2/M3 as a real migration phase, since BBC V1 keeps stub leaves inside `bbc/`. Don't auto-link the leaf to an external repo without an explicit decision.
</process>

<verification>
After running:
- `bbc/distribution/<name>/CLAUDE.md` exists and starts with `<!-- BBC-AUTO-HEADER:BEGIN -->`.
- The block between BEGIN/END markers includes `## Precedence rule` and `## Non-negotiable principles` headings.
- A second consecutive run produces a byte-identical file (idempotent).
</verification>
