# D-leaf-migration — Promote 8azi-dashboard to BBC Leaf (SUMMARY)

## Status

**Complete (2026-05-08).** Earlier session's task #27 was marked completed but the deliverables were missing (template-only CLAUDE.md, empty `.bbc-leaf/`). This session finished both.

## What was finished

1. **`bbc/distribution/dashboard/CLAUDE.md`** — replaced the bootstrap template body with real leaf governance:
   - What this leaf governs (the dashboard's purpose, scope, constraints).
   - Hard dev-only constraint (shell-exec from web server is intentional and only safe on localhost).
   - Skill-specialization plans (future `dashboard.pr-review`).
   - What's NOT in V1 (auth, multi-user, mobile, brain-config-UI, pipeline-builder).
   - Tagged-callsites convention (currently zero by design — dashboard reads BBC files via `fs`, doesn't consume vendor SDKs).
   - Cross-repo coordination (none — dashboard is BBC-only).
   - 4 hard rules.

2. **`/Users/grid/Documents/GitHub/8azi-dashboard/.bbc-leaf/README.md`** — back-pointer per M1 convention. Documents:
   - What BBC is.
   - What governance applies (leaf purpose, dev-only constraint, vendor-tag convention).
   - Where the BBC-side leaf lives.
   - Bootstrap instructions for fresh sessions.
   - Marker version `bbc-leaf-version: 1`.

## Verified

- `bbc/scripts/which-layer.sh` from `bbc/distribution/dashboard/` returns `leaf:dashboard`.
- The auto-header at the top of the leaf CLAUDE.md still inlines Main's Precedence rule and Non-negotiable principles verbatim (bootstrap-leaf.sh idempotent).
- Cross-reference: leaf CLAUDE.md mentions the dashboard repo path; `.bbc-leaf/README.md` mentions the BBC leaf path. Bidirectional.

## Note re: prior session

Tasks #27 and #28 in the task list were marked "completed" / "in_progress" but had no actual content backing them. I treated them as **incorrectly marked** — set #27 back to in_progress, did the work, then marked completed. No data lost; just inconsistent state caught and reconciled.

## Next

D-leaf-migration is now genuinely complete. The dashboard is a real BBC leaf alongside `8azi-web` (M1-migrated) and `_template`.
