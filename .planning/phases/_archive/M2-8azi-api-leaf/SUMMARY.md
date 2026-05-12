# M2 — Migrate 8azi-api as Real Distribution Leaf (SUMMARY)

## Status

**Complete (2026-05-08).** Second real BBC leaf. Mirrors M1's hybrid leaf-vs-pointer convention.

## What was created

- `bbc/distribution/8azi-api/` — bootstrapped via `scripts/bootstrap-leaf.sh 8azi-api`. Auto-header inlines Main's Precedence rule + Non-negotiable principles verbatim.
- `bbc/distribution/8azi-api/CLAUDE.md` — leaf body customized (template replaced with real backend governance).
- `/Users/grid/Documents/GitHub/8azi-api/.bbc-leaf/README.md` — back-pointer per M1 convention.

## What this leaf governs (different from M1)

8azi-api is the **upstream** of two cross-repo invariants — that's the key distinction from 8azi-web:

| Invariant | Direction | Source of truth |
|---|---|---|
| Voice anchor | api → web | `8azi-api/app/shared/llm/prompts.py` + `app/features/party/router.py` |
| Nayin lookup | api → web | `8azi-api/app/bazi/constants.py` (web generates `nayin-lookup.json` from it) |

When this leaf changes either, the proposal MUST attach `cross_leaf_impact:` listing 8azi-web as affected within the same week.

The leaf also encodes a **backend security floor**: any PR touching auth, RLS, or secret handling defaults to `changes_requested` until a maintainer signs off. This is leaf-local, stricter than `general.pr-review`, and is enforced via `8azi-api.pr-review` (already authored in F2-build-3).

## Tagged callsites referenced

Per F4-build-2, this leaf's repo has 4 vendor SDK callsites tagged:

- `app/services/ai.py` → `bbc-provider:anthropic-claude-sonnet`
- `app/routers/party.py` → `bbc-provider:anthropic-claude-sonnet`
- `app/services/supabase.py` → `bbc-provider:supabase`
- `app/services/email.py` → `bbc-provider:resend`

The leaf's CLAUDE.md lists these explicitly so a future decommission knows exactly which files to sweep.

## Verified

- `bash scripts/which-layer.sh` from `bbc/distribution/8azi-api/` returns `leaf:8azi-api`.
- `bash scripts/validate-skill-tree.sh` still clean (the `8azi-api.pr-review` skill was authored in F2-build-3 and is already in the tree).
- The dashboard's `/skills` page now picks up the new leaf automatically — `listLeafResources()` walks `bbc/distribution/`, finds the new `8azi-api/CLAUDE.md`, extracts the shadowed repo path, probes for `.claude/agents/` and `skills-lock.json`. Since 8azi-api has no `.claude/agents/` and no `skills-lock.json`, the leaf shows as `0 agents · 0 pinned`.
- The dashboard's `/graph` (layers tab) now shows three leaves: 8azi-web, 8azi-api, dashboard. No code changes needed — the graph reads live from disk.

## Schema gaps surfaced (none new)

This phase didn't introduce new gaps. The two existing carry-forwards from M1 still apply:
1. `which-layer.sh` is BBC-tree-relative — agents inside `8azi-api/` itself can't auto-resolve their leaf without reading `.bbc-leaf/` first.
2. No automated check that `.bbc-leaf/` and `bbc/distribution/<leaf>/` agree.

## Next

V1 + all F-build phases + M1 + M2 all done. The remaining migration is M3 (8azi-market) — but that repo doesn't exist yet, so M3 is naturally deferred until the marketing workstream materializes.
