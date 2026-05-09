# Rule: Cross-leaf sync

Some memory files are read or enforced by more than one Distribution leaf. Changes to them have to land everywhere they're consumed within a defined window.

## Cross-leaf shared files (V1)

| Memory file | Consumed by | Sync window |
|---|---|---|
| `memory/design/voice-tone.md` | every leaf with user-facing copy | same week |
| `memory/ops/vendors.md` | any leaf that integrates external services | same day |
| `memory/glossary/terms.md` | every leaf | same week |

When the existing 8azi repos migrate (M1, M2), the cross-repo sync precedent already in place becomes a Manager rule:

- `pillar-interactions.ts` (8azi-web) ↔ `prompts.py` (8azi-api) — voice anchor sync, same week.
- `nayin-lookup.json` (8azi-web) generated from `constants.py` (8azi-api) — same day, enforced by `nayin-cross-repo-sync.test.ts`.

## When a proposal touches a cross-leaf file

Manager:

1. Identifies all leaves that consume the file (table above + grep `memory/_index.md`).
2. Adds a `cross_leaf_impact:` block to the proposal frontmatter listing affected leaves.
3. After accept, opens follow-up proposals for each affected leaf if leaf-local files need to update too (e.g., copy in the leaf's repo that quotes the voice rules).

## Concurrent proposals to the same file

V1 policy: **last manager-approved wins.** When two leaves propose conflicting edits to the same target:

- The second proposal automatically gets `changes_requested` with note "rebase against `<first proposal_id>`."
- After the first is accepted (or rejected), the second leaf revises and re-submits.

This is intentionally crude. A merge / three-way reconciliation policy is a future Manager rule.
