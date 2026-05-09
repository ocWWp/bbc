# M1 — Migrate 8azi-web as Real Distribution Leaf (SUMMARY)

## Status

**Complete (2026-05-08).** First real BBC leaf. No symlinks; clean two-way pointer convention.

## Decision: leaf-vs-pointer convention

Hybrid:
- BBC owns the leaf at `bbc/distribution/8azi-web/` (CLAUDE.md, local/, commands/, README.md). Created via `bootstrap-leaf.sh 8azi-web`.
- The 8azi-web repo gains a `.bbc-leaf/` marker at `/Users/grid/Documents/GitHub/8azi-web/.bbc-leaf/README.md` documenting that BBC governs the leaf side and pointing back to it.
- No symlinks. The two are independent file systems linked only by documentation references.

Rationale:
- Symlinks are brittle (move/clone semantics differ across OSes; git treats them oddly).
- The 8azi-web repo has its own CLAUDE.md and shouldn't be symlink-overwritten.
- BBC governance is *opt-in* per concern — vendor decommissioning, skill specialization, cross-repo invariants — not a takeover of the whole codebase.

## Files

- `bbc/distribution/8azi-web/CLAUDE.md` — leaf-side governance (replaced the stub template). Names the real repo path, lists the leaf's skill specialization, cross-repo invariants this leaf enforces, and the bbc-provider-tagged callsites.
- `bbc/distribution/8azi-web/{local,commands}/` — empty dirs ready for use.
- `bbc/distribution/8azi-web/README.md` — boilerplate (kept from bootstrap).
- `/Users/grid/Documents/GitHub/8azi-web/.bbc-leaf/README.md` — back-pointer with version + leaf-id.
- Removed: `bbc/distribution/8azi-web-stub/` (replaced).

## What this leaf governs (vs. doesn't)

BBC governs:
- Vendor decommissioning workflow (bbc-provider:<id> tags in 8azi-web's code).
- Cross-repo voice anchor + Nayin sync invariants.
- Skill specialization (8azi-web.pr-review extends general.pr-review).
- Queue-protocol participation for shared rule changes.

BBC does NOT govern:
- Day-to-day development conventions (8azi-web's own CLAUDE.md remains canonical).
- Branch strategy, deploy commands, security audit list.
- Codebase-internal architecture.

This split is intentional: BBC is layered governance for cross-cutting concerns, not a full project-management replacement.

## Verified

- `bash scripts/bootstrap-leaf.sh 8azi-web` succeeded; auto-header inlines Main's Precedence rule + Non-negotiable principles verbatim.
- `bash scripts/which-layer.sh` from inside `bbc/distribution/8azi-web/` returns `leaf:8azi-web`.
- The `/bbc:invoke pr-review` resolver path picks `8azi-web.pr-review` correctly (tested in F2-build-3).
- The `bbc-provider:<id>` tag grep across `/Users/grid/Documents/GitHub/8azi-web/` finds the 6 callsites tagged in F4-build-2.

## Schema gaps surfaced

1. **`/bbc:invoke pr-review` from inside `8azi-web/` (the real repo) doesn't auto-resolve to `8azi-web.pr-review`.** The resolver runs against bbc/, and `which-layer.sh` is BBC-tree-relative. To resolve from inside 8azi-web, the agent must first read `.bbc-leaf/README.md` to learn the leaf-id, then invoke with `--caller 8azi-web` explicitly. Future M2/M3 will likely benefit from a "find my BBC leaf from anywhere" helper script.
2. **No automated check that `.bbc-leaf/` and `bbc/distribution/<leaf>/` agree.** A rename or move on either side won't be detected. A future `validate-leaves.sh` could grep for `bbc-leaf-version:` markers across known repo paths and verify each has a matching BBC-side leaf.
3. **The leaf's `commands/` directory is empty.** No leaf-specific slash commands defined yet — the F2 resolver handles skill specialization but a leaf might want to provide its own `/8azi-web:dev-server` or similar. Out of scope for M1.

## Carry-forward to M2 / M3

When migrating `8azi-api` (M2) and `8azi-market` (M3, future):
- Same hybrid convention: BBC-side leaf + `.bbc-leaf/` marker in the real repo.
- Each gets its own skill specialization (`8azi-api.pr-review` already authored in F2-build-3; `8azi-market.*` skills will be added when that repo exists).
- Each leaf's CLAUDE.md should explicitly list which `bbc-provider:<id>` tags exist in its real-repo code.

## Next

V1 is complete. The full F1 → F4 design implementations are in (some skeletal, all functional in unit form), the first real leaf is migrated, and the protocol has been exercised end-to-end. Reasonable next moves:

- **M2** — migrate 8azi-api as a leaf (mirrors M1).
- **F4-build-3 follow-ups** — close the four findings (multi-hunk patch atomicity, supersede→archived, file-move support, archive index).
- **F1 trust signal verification** — actually populate stability/external/declared blocks across adapters (gap #5 from F4-build-1).
- **Stop and let it sit.** The architecture is durable; everything from here is iteration.
