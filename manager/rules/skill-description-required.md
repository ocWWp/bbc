# Rule: every skill must have a description recorded in Main

## Why

BBC's Main layer is the **library**. Anything that an agent might invoke — BBC F2 skills, leaf-local sub-agents, or externally-pinned skills installed via a leaf's `skills-lock.json` — must have a one-sentence description that a human (or another agent) can read without traveling to the source repo.

External-ness is not an excuse to be opaque. "We don't control how this skill is implemented" is fine; "we don't know what this skill does" is not.

## Scope (three skill kinds)

| Kind | Where it lives | Where its description must be recorded |
|---|---|---|
| **BBC F2 skill** | `bbc/memory/skills/<tier>/<name>.yaml` | The YAML's body (the skill file IS the record). Description is the first sentence after the `# Skill: ...` heading or in the `## Inherits` / `## Adds` section. |
| **Leaf-local sub-agent** | `<leaf-repo>/.claude/agents/<name>.md` | The agent file's frontmatter `description:` field. Required to be ≤ ~200 chars; if longer, the dashboard truncates and only the first sentence is canonical. |
| **External pinned skill** | `<leaf-repo>/skills-lock.json` (just a name + source URL) | A separate Main-owned file at `bbc/memory/ops/external-skills/<name>.yaml`. Required because skills-lock.json itself has no description field. |

## What "recorded" means

A description is **recorded** when:

1. It's a single sentence (≤ 200 chars after sanitization) describing what the skill DOES, not what it claims to be.
2. It lives in the canonical location for its kind (table above).
3. For BBC F2 skills and external pinned skills: it's set as the value of a `description:` field in the file's frontmatter, OR is the first prose sentence in the body. The dashboard's `condenseDescription` helper is the reference parser.
4. For leaf agents: the frontmatter `description:` is the canonical value. If it's a multi-paragraph wall of text with embedded `<example>` blocks, only the first sentence counts as recorded; the rest is implementation noise.

## Required action when a skill is added

### Adding a BBC F2 skill

The skill's YAML body must include the description. The proposal-review process (per `proposal-review.md`) already enforces well-formed frontmatter; this rule extends it: the body must contain a sentence the dashboard will surface.

### Adding a leaf-local sub-agent

The agent's `.md` file MUST have a `description:` frontmatter field. Leaf-side discipline; BBC doesn't gate the leaf's own .claude/ directory, but a Manager review of any leaf-touching proposal that mentions a new agent will flag a missing description.

### Adding an external pinned skill (most-friction path)

When a leaf adds a new entry to `skills-lock.json`, the same proposal (or a follow-up proposal in the same session) MUST file a `change_kind: add` against `bbc/memory/ops/external-skills/<name>.yaml` containing:

- `external_skill_id: <name>` (matches skills-lock.json key)
- `source: <github:owner/repo or other URL>`
- `source_type: github | npm | local | other`
- `used_by_leaves: [<leaf>, ...]`
- `description: "<one sentence>"`

Without this companion proposal, Manager refuses the leaf-side update. Reason: a skill that nobody can describe shouldn't be invocable.

## When a skill is removed

The corresponding library entry is NOT deleted — it gets `status: archived` (mirroring the F4 decommission pattern). External skills churn fast; archived entries serve as a "we used to use this" historical record.

## Detection

V1: manual review by Manager during queue triage. Manager checks:
- New BBC F2 skill files have a description sentence in the body.
- Proposals adding external skills include the companion library entry.
- Proposals adding leaf agents have non-empty frontmatter `description:`.

V1.x (future, named): a `scripts/lint-skill-descriptions.sh` that walks all three locations and reports any without descriptions, then fails CI if `--strict`.

## Procedure when violation found

Verdict: `changes_requested`. Notes:
1. Identify the missing description.
2. Suggest where it should go (table above).
3. Reference this rule.

## Why this matters

The dashboard surfaces every skill across all leaves to a human reviewer. If half the skills show "(no description)", the dashboard is useless and the brain is opaque. Main's job as the library is to make sure every skill has a one-line answer to "what does this do?" — recorded once, surfaced everywhere.
