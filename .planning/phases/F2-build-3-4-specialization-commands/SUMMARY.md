# F2-build-3 + F2-build-4 — Leaf Specializations + Skill Slash Commands (SUMMARY)

## Status

**Complete (2026-05-08).** Three leaf specializations + two new slash commands.

## Files

```
memory/skills/
├── marketing/pr-review.yaml      # extends general.pr-review; warm-mystical voice + brand rules
├── 8azi-web/pr-review.yaml       # extends general.pr-review; +Tailwind + cross-repo + bbc-provider tag rules
└── 8azi-api/pr-review.yaml       # extends general.pr-review; +security/RLS/rate-limit rules

bbc/.claude/commands/bbc/
├── invoke-skill.md               # /bbc:invoke <short-id> — resolve + surface
└── skill-trace.md                # /bbc:skill-trace <short-id> — show chain only
```

`help.md` updated to list the two new commands.

## Polymorphism verified

Same `pr-review` request, three different effective skills:

| Caller | Effective skill | Walk |
|---|---|---|
| `8azi-web` | `8azi-web.pr-review` | skill → review-skill → general.pr-review → 8azi-web.pr-review |
| `8azi-api` | `8azi-api.pr-review` | skill → review-skill → general.pr-review → 8azi-api.pr-review |
| `marketing` | `marketing.pr-review` | skill → review-skill → general.pr-review → marketing.pr-review |
| `general` (manager/main) | `general.pr-review` | skill → review-skill → general.pr-review |

Validator: 10 skills examined, **clean ✓**.

## Override mode usage

- All three leaf specializations declare `rules.add: [...]` and `rules.keep_from_parent: true`.
- Marketing also overrides `voice` (warm-mystical) — a `replace`-mode override of a scalar field.
- 8azi-web and 8azi-api inherit voice from parent (terse-engineering).

The current resolver does NOT yet implement override-mode merging — it concatenates body sections and last-wins on scalar frontmatter. The `rules.add:` blocks are visible in the resolved output as parts of the inherited body, so the agent reading the resolved skill sees ALL rules. This is acceptable for V1.

## Schema gaps surfaced

1. **Override mode merging is not yet executed by resolver.** The yaml declares `rules.add:` but the resolver doesn't merge lists; it concatenates body sections. An agent reading the resolved skill sees both parent and child rules in separate sections, which works but doesn't produce a single merged "rules:" list. Fix in F2-build-5 (future).
2. **`marketing` is not yet a real leaf.** `bbc/distribution/marketing/` doesn't exist; `marketing.pr-review` is a forward-looking specialization. M1 (8azi-web migration) doesn't add it; a future M3 would.
3. **`/bbc:invoke` does not yet apply the resolved skill autonomously.** It surfaces the body and trusts the caller to follow the rules. Real automation (e.g., a sub-agent that ingests a resolved review skill and produces a verdict) is its own future phase.

## Next

F1-build-3 + F1-build-4 — outcome log scaffolding + binding-update integration. After that, F3-build-2..5 (failover scaffolding), then M1.
