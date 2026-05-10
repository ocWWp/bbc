---
name: bbc:bootstrap-leaf
description: Scaffold a new Distribution leaf, or refresh an existing one's auto-header
allowed-tools:
  - Bash
  - Read
---

<objective>
Wrap `bbc/scripts/bootstrap-leaf.sh` with a friendlier interface. Used for two cases:

1. **Create a new leaf** for a workstream (e.g., when adding `marketing` or `mobile` as a new repo your tenant governs).
2. **Refresh an existing leaf** after Main's `Precedence rule` or `Non-negotiable principles` sections changed — the auto-header re-extracts them verbatim.

The script itself is idempotent; this command just adds context awareness.
</objective>

<process>
1. Get the leaf name from the user. Validate:
   - Lowercase, kebab-case, no slashes, no dots.
   - Not the reserved name `_template`.
   - Match a kebab-case convention that names the workstream this leaf governs (e.g. `web`, `api`, `mobile`, `marketing`, `data`).

2. Check whether `<tenant-repo>/distribution/<name>/` already exists (where `<tenant-repo>` is the dir holding the user's tenant content — typically the repo set via `BBC_REPO`, or the BBC product repo itself if developing on BBC). Tell the user whether this is a create or a refresh.

3. Run the script from the tenant repo root (or BBC repo root if no separate tenant exists yet):
   ```bash
   bash <bbc>/scripts/bootstrap-leaf.sh <name>
   ```
   where `<bbc>` is the path to the BBC product repo (e.g. `/Users/grid/Documents/GitHub/bbc`).

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
