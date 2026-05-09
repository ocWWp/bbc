# F2-build-1 — Abstract Bases + general.* Skills (SUMMARY)

## Status

**Complete (2026-05-08).** 4 abstract bases + 3 concrete general skills authored.

## Files

```
memory/skills/
├── _abstract/
│   ├── skill.yaml           # root; everything traces here
│   ├── review-skill.yaml    # extends: skill — verdict + rationale + findings
│   ├── edit-skill.yaml      # extends: skill — diff + rollback_safe
│   └── analyze-skill.yaml   # extends: skill — report + findings_count
└── general/
    ├── pr-review.yaml       # extends: review-skill (full PR)
    ├── code-review.yaml     # extends: review-skill (single file)
    └── doc-review.yaml      # extends: review-skill (docs)
```

`_resolved/` directory created (empty; populated by F2-build-2's resolver).

## Schema observations

- The `extends:` chain is well-formed: every concrete skill traces to a `_abstract/*.yaml`, and every abstract traces to `skill`.
- `voice:` and `allowed_tools:` are concrete-skill-only fields — abstracts don't declare voice (they don't have one until specialized).
- Each general skill has a "Body" section that's the runbook (parallel to `.claude/commands/bbc/*.md`). The resolver will inline this when materializing.

## Schema gaps surfaced

1. **No leaf-tier specializations yet.** F2-build-3 will add `marketing.pr-review`, `8azi-web.pr-review`, etc.
2. **`allowed_tools:` field name conflicts with Claude Code's `allowed-tools` (hyphen).** Skills use underscore (YAML idiomatic) but commands use hyphen (Claude Code convention). Future resolver must normalize.
3. **Body section is freeform Markdown** — no schema for it. F2-build-2's validator will treat it as opaque text.
4. **`severity` enum** in `pr-review.yaml` and `code-review.yaml` is not defined as a separate type. Should be: `[critical, high, medium, low, nit]`. Worth promoting to a typedef.

## Next

F2-build-2 (resolve-skills.sh + validate-skill-tree.sh) — implement the resolution algorithm so leaf calls can actually inherit from these.
