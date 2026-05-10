# BBC — Brain Cortex

**One line:** a markdown-based brain protocol for engineering teams. Three-layer CLAUDE.md hierarchy + a proposal queue + a dashboard + an MCP server. Any agent — in GitHub, Cursor, terminal, the BBC dashboard — bootstraps from this repo.

## What BBC is

A protocol + product for managing a team's company brain (decisions, memory, voice, vendor bindings) with mechanism instead of discipline.

```
Main (CLAUDE.md)              ← principles, locked from below
  └─ Manager (manager/CLAUDE.md)        ← product workflow, queue review
       └─ Distribution (distribution/<leaf>/CLAUDE.md)  ← per-workstream context
```

Lower layers can specialize. Lower layers cannot override. Conflict → Main wins.

A leaf that wants to change a Main- or Manager-owned rule files a **proposal** in `queue/`. Manager reviews. Main accepts. The file then moves to `queue/_accepted/`. That is the entire write protocol.

## Two deployment modes (one protocol)

- **File-mode** — single-tenant self-host. Memory in markdown files; writes via `bash scripts/{accept,reject,propose}.sh`. Use this for solo dev or one-team self-host.
- **DB-mode** — multi-tenant SaaS. Memory in RLS-gated Supabase rows; writes via SQL functions. The hosted bbc.tools deployment uses this.

The dashboard, MCP server, and `@bbc/store` interface speak both modes. See `memory/tech/deployment-modes.md` and `docs/tenant-repo-architecture.md`.

## Layout

```
bbc/
├── CLAUDE.md                       # Main precedence rules + lock matrix
├── AGENTS.md                       # onboarding cheat-sheet for LLM agents
├── apps/
│   ├── dashboard/                  # Next.js dashboard (@bbc/dashboard)
│   └── mcp-server/                 # Model Context Protocol bridge
├── packages/
│   └── store/                      # typed storage interface (@bbc/store)
├── memory/
│   ├── _schema.md                  # frontmatter contract
│   ├── decisions/                  # BBC product ADRs
│   ├── tech/                       # architecture docs
│   └── ops/
│       ├── provider-roles/         # role contracts (db-provider, llm-provider, …)
│       └── providers/              # example-*-provider.yaml adapter examples
├── manager/                        # Manager CLAUDE.md, agents, rules
├── distribution/
│   ├── _template/                  # leaf scaffolding
│   └── dashboard/                  # BBC dashboard's own leaf doc
├── templates/initial-tenant/       # bare forkable skeleton
├── examples/example-tenant/        # runnable Acme Co demo
├── scripts/                        # bash protocol scripts
├── docs/                           # operating-bbc.md, tenant-repo-architecture.md
└── .planning/phases/F0-F4-*/       # productization phase records
```

See `CLAUDE.md` for the precedence rule and full lock matrix.

## I want to actually run this

Three audiences, three docs:

- **Operators** (running BBC for your team / self-hosting) → [`docs/operating-bbc.md`](docs/operating-bbc.md). Supabase setup, bootstrapping your first tenant + admin, daily-use loop (invite, queue, audit, API keys), mode switching.
- **Tenant authors** (forking a tenant repo to plug into BBC) → [`docs/tenant-repo-architecture.md`](docs/tenant-repo-architecture.md). The skeleton + slot model, file-mode vs DB-mode plug-in, forking the template.
- **Agents** (LLMs opening a session inside `bbc/`) → [`AGENTS.md`](AGENTS.md). Layer detection, hard rules.
- **Developers** working on the dashboard or MCP server → [`apps/dashboard/README.md`](apps/dashboard/README.md), [`apps/mcp-server/README.md`](apps/mcp-server/README.md).

## Quickstart (file-mode, against the demo tenant)

```bash
pnpm install
BBC_REPO=examples/example-tenant pnpm --filter @bbc/dashboard dev
# http://localhost:3000
```

The dashboard reads the Acme Co demo at `examples/example-tenant/`. Click around `/queue`, `/log`, `/bindings` to see what a populated tenant looks like.

To use BBC against your own tenant, fork [`templates/initial-tenant/`](templates/initial-tenant/) into a new repo, then `BBC_REPO=path-to-your-tenant pnpm --filter @bbc/dashboard dev`.

## Slash commands

When a Claude session is opened anywhere in the BBC tree, these are auto-discovered:

```
/bbc:help              List all commands grouped by layer
/bbc:status            Where am I, what's pending, what changed
/bbc:bootstrap-leaf    Create or refresh a Distribution leaf
/bbc:propose           File a queued change
/bbc:review            Manager triages the queue (spawns sub-agent)
/bbc:accept            Main applies an approved proposal
/bbc:dashboard         Surface the dashboard URL + run status
```

For global access (commands available outside the BBC tree too):

```bash
bash scripts/install-skills.sh
```

This symlinks the project's command set into `~/.claude/commands/bbc/`. Idempotent; reversible with `--uninstall`.

### Bash equivalents (always work)

```bash
bash scripts/bootstrap-leaf.sh my-leaf-name
bash scripts/propose.sh --target main --file memory/<path> \
     --kind edit --summary "..." --source "..." --body-file <path>
bash scripts/accept.sh <proposal_id>
bash scripts/reject.sh <proposal_id> --reason "..."
bash scripts/index-memory.sh
bash scripts/which-layer.sh    # diagnostic: what layer am I in?
```

## License

AGPL-3.0. See [`LICENSE`](LICENSE).
