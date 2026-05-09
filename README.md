# BBC — 8aZi Brain Cortex

**One line:** the company brain for 8aZi. Markdown memory + 3-layer Claude.md hierarchy + a proposal queue. Any agent — in GitHub, Cursor, terminal, future dashboard — bootstraps from this repo.

## What V1 actually is

A folder of markdown files (the company memory) plus three `CLAUDE.md` files arranged in a strict precedence:

```
Main (bbc/CLAUDE.md)              ← principles, locked from below
  └─ Manager (bbc/manager/CLAUDE.md)        ← product workflow, queue review
       └─ Distribution (bbc/distribution/<leaf>/CLAUDE.md)  ← per-workstream context
```

Lower layers can specialize. Lower layers cannot override. Conflict → Main wins.

A leaf that wants to change a Main- or Manager-owned rule files a **proposal** in `bbc/queue/`. Manager reviews. Main accepts. The file then moves to `bbc/queue/_accepted/`. That is the entire write protocol for V1.

## What V1 is NOT

No dashboard, no n8n auto-pipelines, no auto-tool-credibility ranker, no shadow brain failover, no provider abstraction, no OOP skill inheritance. Each of those is a named follow-on phase (see `.planning/ROADMAP.md`, items F1–F4).

## Layout

```
bbc/
├── CLAUDE.md             # Main — principles + precedence + lock matrix
├── AGENTS.md             # onboarding cheat-sheet
├── memory/               # company memory (semantic categories)
├── manager/              # Manager CLAUDE.md, agents, rules
├── distribution/         # leaves (one per workstream)
├── queue/                # proposal queue (pending + _accepted/ + _rejected/)
├── scripts/              # bash only — propose, accept, bootstrap, index
└── .planning/            # GSD phase tracking
```

See `CLAUDE.md` for the precedence rule and full lock matrix.

## Quickstart

The day-to-day path uses slash commands (Phase 08). When a Claude session is opened anywhere in the BBC tree, these are auto-discovered:

```
/bbc:help              List all commands grouped by layer
/bbc:status            Where am I, what's pending, what changed
/bbc:bootstrap-leaf    Create or refresh a Distribution leaf
/bbc:propose           File a queued change (leaf or manager)
/bbc:review            Manager triages the queue (spawns sub-agent)
/bbc:accept            Main applies an approved proposal
```

For global access (commands available outside the BBC tree too):

```bash
bash scripts/install-skills.sh
```

This symlinks the project's command set into `~/.claude/commands/bbc/`. Idempotent; reversible with `--uninstall`.

### Bash equivalents (always work)

```bash
bash scripts/bootstrap-leaf.sh my-leaf-name
bash scripts/propose.sh --target main --file memory/design/voice-tone.md \
     --kind edit --summary "..." --source "..." --body-file <path>
bash scripts/accept.sh <proposal_id>
bash scripts/reject.sh <proposal_id> --reason "..."
bash scripts/index-memory.sh
bash scripts/which-layer.sh    # diagnostic: what layer am I in?
```

## End-to-end verification

See `.planning/phases/06-verification/PLAN.md` — the 5-step walkthrough that proves V1 works across separate Claude sessions with audit trail.

## Status

V1 in progress. See `.planning/STATE.md`.
