# Onboarding for Agents

You are an LLM operating inside the BBC repo. Read this first, then `CLAUDE.md`, then the Manager and Distribution `CLAUDE.md` if relevant.

## What this repo is

Company brain for 8aZi. Three layers (Main → Manager → Distribution) communicating through Markdown memory and a proposal queue.

## How to find your layer

Where you opened the session decides your role:

| You started in… | You are | Read first |
|---|---|---|
| `bbc/` (root) | Main session — high-trust, principle-level edits | `CLAUDE.md` |
| `bbc/manager/` | Manager session — review queue, edit Manager rules | `../CLAUDE.md` then `CLAUDE.md` |
| `bbc/distribution/<leaf>/` | Distribution leaf — local rules + proposals only | `../../CLAUDE.md` → `../../manager/CLAUDE.md` → `CLAUDE.md` |

If you can't tell which layer you're in, stop and ask the human.

## Hard rules (apply at every layer)

1. **Precedence is Main > Manager > Distribution.** You cannot override an upper layer; you can only specialize or propose.
2. **Direct writes only inside your `owning_layer`.** Anything else goes through `scripts/propose.sh`.
3. **Memory files always have YAML frontmatter** with at minimum: `id`, `type`, `scope`, `layer`, `source`, `created`, `updated`, `owning_layer`, `status`. See `memory/_schema.md`.
4. **Don't invent vendor names.** If a tool is "what's currently used for X," it lives in `memory/ops/vendors.md`. Cite that file; don't hardcode names elsewhere.
5. **Never modify Main's `CLAUDE.md` from a non-Main session.** Even if asked.

## Files you'll touch most

- `memory/` — company knowledge by category.
- `queue/` — your proposal lands here as a single file. Use `scripts/propose.sh`.
- `distribution/<your-leaf>/local/` — leaf-only scratch / pre-promotion notes.

## When in doubt

Pause and write a proposal rather than acting. Proposals are cheap; reverting a Main-layer mutation is expensive.
