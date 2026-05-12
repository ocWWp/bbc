# Phase 08 — Built-in `/bbc:*` Commands (DESIGN)

## Context

V1 ships with bash scripts (`propose.sh`, `accept.sh`, `bootstrap-leaf.sh`, etc.) that humans and agents invoke directly. Like GSD ships `/gsd:plan-phase`, `/gsd:progress`, etc., BBC should ship a set of `/bbc:*` slash commands that wrap the scripts in agent-friendly skill markdown so Claude sessions can do the right thing without the human typing bash.

This file is a design doc. Implementation is a follow-on once the design is approved.

---

## 1. Naming and discovery

- **Prefix:** `/bbc:*` (mirrors `/gsd:*`).
- **Location:** project-local at `bbc/.claude/skills/<name>/SKILL.md`. Skills are versioned with the BBC repo, not installed user-globally. A future `bbc/scripts/install-skills.sh` can symlink them to `~/.claude/skills/` for power users; default workflow is "open a Claude session in or below the bbc/ tree, the skills are picked up."

Rationale: BBC is the brain. The brain ships with its own operating commands. Different orgs' BBCs may diverge (different leaves, different rules); their skill sets should diverge too without polluting global skill space.

---

## 2. Command set (V1)

Six **essential** commands plus three **convenience** commands. Each maps to one or more existing scripts; none introduces new logic for V1.

### Essential

| Command | Layer it's used at | Wraps | Effect |
|---|---|---|---|
| `/bbc:status` | any | (read-only) | Detect current layer from `$PWD`. Print: layer, pending queue items, last 5 entries in `_accepted/`, last 5 entries in `_rejected/`, leaf-local notes if at a leaf. Mirrors `/gsd:progress`. |
| `/bbc:propose` | leaf or manager | `scripts/propose.sh` | Interactive wrapper. Asks for `--target`, `--file`, `--kind`, `--summary`, `--source`, optional body. Produces a queue file. Refuses if not run from a layer that can propose. |
| `/bbc:review` | manager | none (writes manager_review block) | Loop over `queue/*.md` (pending). For each, apply `manager/rules/proposal-review.md`, `cross-leaf-sync.md`, `promotion-criteria.md`. Append `manager_review:` (and `cross_leaf_impact:` / `promotion_check:` where the rules call for it). Equivalent to spawning the `manager/agents/queue-reviewer.md` sub-agent. |
| `/bbc:accept` | main (human) | `scripts/accept.sh` | Confirm the proposal id with the user, show its `manager_review.verdict`, then run accept.sh. Refuses to run from non-Main contexts unless `--force`. |
| `/bbc:bootstrap-leaf` | any | `scripts/bootstrap-leaf.sh` | Wraps the script with a couple-line summary of what it just did. |
| `/bbc:help` | any | (read-only) | List all `/bbc:*` commands with one-line descriptions, grouped by layer. |

### Convenience (V1.1 — drop if scope creeps)

| Command | Layer | Wraps | Effect |
|---|---|---|---|
| `/bbc:reject` | main (human) | `scripts/reject.sh` | Wraps reject.sh with a `--reason` prompt. |
| `/bbc:promote` | leaf | `scripts/propose.sh --kind add` | Special-case helper for "I have a local note in `local/`, promote it to Main-owned memory under category X." Reads the local note, asks which `memory/<category>/` to put it in, generates the right `add` proposal. |
| `/bbc:health` | any | (read-only) | Sanity check: orphan files in `memory/` not in `_index.md`, frontmatter schema violations, broken `[[wikilinks]]`, queue files missing required fields, leaves with stale auto-headers (Main changed since last bootstrap). Mirrors `/gsd:health`. |

---

## 3. Skill file format

Each `bbc/.claude/skills/<name>/SKILL.md` follows this shape (modeled on the gsd skill patterns visible in the available-skills listing):

```markdown
---
name: bbc:<name>
description: <one-line — used to decide skill relevance in future conversations>
allowed-tools: [Bash, Read, Edit, Write]   # narrow per skill
---

# /bbc:<name>

## When to use
<a few bullets — when the user invokes this command, when Claude should auto-invoke>

## Inputs
<arg shape, what the user/agent must supply>

## Steps
1. Detect layer from $PWD; refuse if wrong layer.
2. ...
3. Run `bash scripts/<script>.sh ...` (the existing tested script).
4. Summarize what happened.

## Output
<what the user sees afterward — short>
```

This makes the skill a **thin behavioral wrapper** over the bash script. The script remains the source of truth for the actual mutation; the skill encodes the agent-facing UX (layer detection, prompting, summarization, refusal logic).

---

## 4. Layer-detection helper

Every command needs to know "which layer am I running in?" The detection logic appears 6 times in skills. To avoid drift, factor it once into a script:

```
bbc/scripts/which-layer.sh
  → prints one of: main | manager | leaf:<name> | unknown
  → reads from $PWD relative to the BBC repo root
```

Skills source this. If a skill is invoked from `unknown`, the skill refuses with a message like "Run this from inside `bbc/`, `bbc/manager/`, or `bbc/distribution/<leaf>/`."

---

## 5. Sub-agent reuse

Two of the essential commands (`/bbc:review`) and one convenience command (`/bbc:health`) are well-suited to sub-agent delegation rather than inline logic:

- `/bbc:review` → spawns `manager/agents/queue-reviewer.md` (already exists). Skill markdown defines the trigger; the actual reasoning loop is the sub-agent's.
- `/bbc:health` → would spawn a new `manager/agents/repo-auditor.md` (NOT V1; design later).

This keeps the skill files lean and the heavy reasoning in dedicated sub-agent definitions — same separation pattern as gsd.

---

## 6. Repo layout impact

```
bbc/
└── .claude/
    └── skills/
        ├── bbc-status/SKILL.md
        ├── bbc-propose/SKILL.md
        ├── bbc-review/SKILL.md
        ├── bbc-accept/SKILL.md
        ├── bbc-reject/SKILL.md             # V1.1
        ├── bbc-promote/SKILL.md            # V1.1
        ├── bbc-bootstrap-leaf/SKILL.md
        ├── bbc-health/SKILL.md             # V1.1
        └── bbc-help/SKILL.md
```

(Skill directory name uses hyphen; the user-facing slash command keeps the colon: `bbc-status` directory → `/bbc:status` command. This matches Claude's skill naming convention.)

Plus one new script:

```
bbc/scripts/which-layer.sh   # layer detection helper
```

---

## 7. Verification approach

For each command, the same lightweight test:

1. From the wrong layer → command refuses with a clear message.
2. From the right layer → command performs the wrapped script's work and prints the summary.
3. With invalid arguments → command surfaces the underlying script's error verbatim, doesn't swallow it.

A subagent walkthrough analogous to Phase 06 (open three blind sessions, run a flow that uses 2-3 of the skills) is the acceptance gate before declaring Phase 08 complete.

---

## 8. Out of scope for V1 of Phase 08

- **`/bbc:init`** — bootstrapping a brand-new BBC repo for an org from scratch. Big enough to deserve its own phase.
- **`/bbc:diff`** — show the unified diff a pending proposal would apply, with target file context. Useful but optional; can be done with `cat` for now.
- **Skill auto-installer** — copying skills to `~/.claude/skills/` so they appear in agents' default skill lists outside the BBC tree. Defer.
- **Telemetry / metrics** — how often each command is used, who triggered it. Pure observability; not on critical path.

---

## 9. Decisions (resolved 2026-05-08)

| Decision | Resolution |
|---|---|
| Skill location | **Project-local + install script.** Live in `bbc/.claude/commands/bbc/`. `bbc/scripts/install-skills.sh` symlinks them into `~/.claude/commands/bbc/` for users who want global access. |
| V1 scope | **Six essential commands.** `status`, `propose`, `review`, `accept`, `bootstrap-leaf`, `help`. `reject`, `promote`, `health` deferred to V1.1. |
| `/bbc:review` impl | **Spawns fresh sub-agent** per call. Brief points at `bbc/manager/agents/queue-reviewer.md`. |
| Permissions | **Yes**, `bbc/.claude/settings.json` allowlists `bash scripts/<each>.sh:*` for the BBC scripts. Suppresses the prompt-per-call friction for read-only commands like `/bbc:status`. |
