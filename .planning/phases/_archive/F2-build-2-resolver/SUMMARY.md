# F2-build-2 — Resolver + Tree Validator (SUMMARY)

## Status

**Complete (2026-05-08).** Both scripts shipped and tested.

## Files

- `scripts/resolve-skills.sh` — F2 resolver. Walks specificity tier (caller → general → abstract) to find the most-specific skill matching a `<short-id>`, then walks `extends:` chain to materialize the effective skill.
- `scripts/validate-skill-tree.sh` — checks every skill has required frontmatter, every `extends:` points to an existing skill, no cycles, chains terminate at root `skill`.

## Verified

- `validate-skill-tree.sh` → `clean ✓` (7 skills examined: 4 abstract + 3 general).
- `resolve-skills.sh pr-review --caller general` → produces effective skill with chain trace `skill → review-skill → general.pr-review`. Caches to `memory/skills/_resolved/general__pr-review.yaml`.

## Schema observations

- Resolver caches output under `_resolved/<caller>__<short>.yaml`. The cache is reproducible — delete + re-run produces identical content.
- Body sections from each chain link concatenate (with provenance comments) into the resolved output. Concrete skill's body comes last (most specific).
- Override modes (`replace` / `add` / `remove`) from the F2 PLAN are **not yet implemented** — V1 uses simple last-wins for scalar fields. F2-build-3 (first leaf specialization) will exercise overrides and motivate the implementation.

## Schema gaps surfaced

1. **Override modes not implemented yet.** Currently last-wins. When `8azi-web.pr-review` declares `rules.add: ["..."]`, the resolver will need real list-merge logic. F2-build-3 territory.
2. **Body-section merging is concatenation, not structured merge.** A reader of the resolved skill sees three separate "inherited from X" sections rather than one synthesized body. Acceptable for V1 (helps audit); not ideal for direct LLM consumption.
3. **Inputs / Outputs schema is described in prose, not parsed.** Validator does only loose existence checks. Stricter contract verification needs parseable schema syntax (a future schema language for the body, or YAML for inputs/outputs sections).

## Next

F2-build-3 + F2-build-4 — leaf specializations + skill slash commands. Will exercise the override modes for real and surface their implementation needs.
