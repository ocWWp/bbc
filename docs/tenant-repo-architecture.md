# Tenant Repo Architecture

How BBC (the protocol + product) and a tenant's content stay separate but work together.

## The split

```
┌────────────────────────────────────────────────────────────────────────┐
│   github.com/ocWWp/bbc                            (public, AGPL-3.0)   │
│   ────────────────────────                                             │
│   apps/dashboard           ← BBC dashboard UI (Next.js)                │
│   apps/mcp-server          ← MCP bridge for agents                     │
│   packages/store           ← typed storage interface                   │
│   scripts/                 ← protocol bash scripts (propose/accept)    │
│   manager/                 ← Manager rules + queue-review agent        │
│   memory/_schema.md        ← frontmatter schema (the contract)         │
│   memory/decisions/        ← BBC product ADRs (0001, 0002, 0004)       │
│   memory/tech/             ← BBC architecture docs                     │
│   memory/ops/provider-roles/  ← role contracts (db-provider, …)        │
│   memory/ops/providers/    ← example-*-provider.yaml (placeholders)    │
│   distribution/_template/  ← leaf scaffolding                          │
│   distribution/dashboard/  ← BBC dashboard's own leaf                  │
│   templates/initial-tenant/   ← bare forkable skeleton                 │
│   examples/example-tenant/    ← runnable Acme Co demo                  │
│   docs/                    ← operating-bbc.md, this file               │
└────────────────────────────────────────────────────────────────────────┘

                              ↕  plugged in via BBC_REPO env var (file-mode)
                              ↕  or via Supabase rows (DB-mode, multi-tenant)

┌────────────────────────────────────────────────────────────────────────┐
│   Your tenant repo                              (private — your call)  │
│   ─────────────────                                                    │
│   CLAUDE.md                ← your Main precedence rules                │
│   memory/                                                              │
│     decisions/             ← your ADRs                                 │
│     people/team.md         ← your team                                 │
│     design/voice-tone.md   ← your brand voice                          │
│     glossary/              ← your terms                                │
│     product/               ← your strategy                             │
│     ops/                                                               │
│       bindings.yaml        ← your role→provider table                  │
│       vendors.md           ← your vendor commitments                   │
│       providers/<vendor>.yaml   ← your vendor adapters                 │
│   distribution/<your-leaves>/   ← per-workstream context               │
│   queue/                   ← live + archived proposals                 │
│     _accepted/, _rejected/                                             │
│   _log/operations.jsonl    ← your audit trail                          │
└────────────────────────────────────────────────────────────────────────┘
```

## What BBC provides — the "skeleton"

- **Protocol contracts**: `memory/_schema.md` (frontmatter), `memory/ops/provider-roles/*.yaml` (what each role must support), `manager/rules/*` (review rules).
- **Tooling**: dashboard, MCP server, `scripts/{propose,accept,reject}.sh`, `@bbc/store` interface.
- **Templates**: `templates/initial-tenant/` (bare skeleton), `distribution/_template/` (leaf scaffolding), `memory/ops/providers/example-*-provider.yaml` (adapter shape).
- **Documentation**: `CLAUDE.md`, `AGENTS.md`, `docs/operating-bbc.md`, this file.

These are versioned with the BBC product. When BBC ships a new schema version, your tenant repo updates by pulling the new schema and migrating.

## What a tenant provides — the "slot content"

- **Real memory** — your decisions, people, voice, glossary, vendors, bindings.
- **Distribution leaves** — one folder per workstream/repo you govern.
- **Queue + log** — your operational history.

These are versioned with your tenant. They never go upstream into BBC.

## How they plug together

### File-mode (single-tenant self-host or solo dev)

Set `BBC_REPO=path-to-your-tenant-repo` and run the dashboard:

```bash
# From the BBC monorepo root
BBC_REPO=/Users/you/Documents/GitHub/your-tenant pnpm --filter @bbc/dashboard dev
```

The dashboard reads `path-to-tenant-repo/memory/`, `path-to-tenant-repo/queue/`, etc. Writes shell out to `scripts/{accept,reject,propose}.sh` invoked with `--repo path-to-tenant-repo`.

Default if `BBC_REPO` is unset: `examples/example-tenant/` so newcomers see the dashboard alive against the Acme Co demo immediately.

### DB-mode (multi-tenant SaaS)

Each tenant gets `tenant_id`-scoped rows in Supabase. The dashboard reads via `SupabaseStore` and writes via SQL functions (`accept_proposal()`, `reject_proposal()`, `create_invitation()`, etc.). RLS policies enforce tenant isolation.

Tenants don't have a "repo" in DB-mode — their content lives in the database. To migrate from file-mode to DB-mode (e.g., a self-hoster signs up for the SaaS), the future `bbc-cli import` command serializes their files into a tenant's tables.

## Forking the skeleton

To start your own tenant repo:

```bash
# 1. Clone the templates/initial-tenant/ contents into a new repo
mkdir ~/Documents/GitHub/your-tenant
cd ~/Documents/GitHub/your-tenant
cp -R /path/to/bbc/templates/initial-tenant/. .
git init && git add -A && git commit -m "Bootstrap from BBC initial-tenant template"

# 2. Edit CLAUDE.md, memory/decisions/0001-*.md, memory/people/team.md,
#    memory/ops/bindings.yaml — make them YOURS.

# 3. Run BBC against your new tenant repo
cd /path/to/bbc
BBC_REPO=~/Documents/GitHub/your-tenant pnpm --filter @bbc/dashboard dev
```

Or follow the runnable demo at `examples/example-tenant/` for a more populated starting point.

## Why this split

- **BBC is generic.** Anyone can fork it, run it, contribute to it. Public AGPL-3.0.
- **Your tenant is private.** Your decisions, your team, your bindings stay in a repo you control.
- **Updates flow one way.** When BBC improves (new schema, new dashboard features), you pull the new BBC. Your tenant repo doesn't push back into BBC — your content is yours.
- **Multi-tenant SaaS works the same way logically.** The dashboard plugs into your tenant's DB rows instead of your tenant's file tree. Same protocol, two storage backends. See [`memory/tech/deployment-modes.md`](../memory/tech/deployment-modes.md).

## See also

- [`docs/operating-bbc.md`](./operating-bbc.md) — operator quickstart (Supabase setup, bootstrap, daily-use)
- [`memory/tech/deployment-modes.md`](../memory/tech/deployment-modes.md) — file-mode vs DB-mode contract
- [`memory/tech/repo-structure.md`](../memory/tech/repo-structure.md) — BBC monorepo layout
- [`templates/initial-tenant/`](../templates/initial-tenant/) — bare skeleton to fork
- [`examples/example-tenant/`](../examples/example-tenant/) — runnable demo
