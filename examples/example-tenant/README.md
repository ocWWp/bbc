# Example Tenant — "Acme Co"

A **fully-runnable example BBC tenant** for the fictional company Acme Co. Use this to see what BBC looks like when wired up; fork [`templates/initial-tenant/`](../../templates/initial-tenant/) to start your own.

## Use it

From the BBC monorepo root:

```bash
BBC_REPO=examples/example-tenant pnpm --filter @bbc/dashboard dev
# http://localhost:3000
```

The dashboard reads this directory as the tenant's BBC instance: memory in `memory/`, queue in `queue/`, audit log in `_log/`, bindings in `memory/ops/bindings.yaml`.

## What's inside

```
examples/example-tenant/
├── CLAUDE.md                       Acme's Main precedence rules (mode-aware)
├── memory/
│   ├── _schema.md                  Frontmatter contract (inherited from BBC)
│   ├── decisions/
│   │   ├── 0001-acme-bbc-bootstrap.md     Bootstrap ADR
│   │   └── 0002-acme-pick-postgres.md     Sample binding decision
│   ├── people/team.md              Acme's 3-person team
│   ├── design/voice-tone.md        Acme's voice (generic example)
│   ├── glossary/terms.md           Generic glossary
│   └── ops/
│       ├── vendors.md              "see bindings.yaml" pointer
│       ├── bindings.yaml           Acme's role→provider table
│       └── providers/              Copies of BBC's example-*-provider.yaml
├── distribution/
│   └── example-leaf/CLAUDE.md      One example Distribution leaf
├── queue/
│   ├── sample.md                   Pending demo proposal
│   └── _accepted/
│       └── 2026-05-09_acme-bind-postgres.md   Historical accept
├── _log/
│   ├── operations.jsonl            6 demo log entries
│   └── lkg.txt                     Last-known-good marker
└── .planning/STATE.md              Stub state file the dashboard's overview reads
```

## Why an example tenant exists

BBC is a protocol + dashboard + MCP server. A protocol on its own doesn't show what a healthy tenant looks like. This directory is the answer to "show me a real BBC instance" without the operator having to bootstrap their own first.

It's deliberately fictional (Acme Co is not a real company) so newcomers don't try to grep it for production patterns. The shape is real; the content is illustrative.

## Difference from `templates/initial-tenant/`

| | templates/initial-tenant/ | examples/example-tenant/ (this) |
|---|---|---|
| Purpose | Forkable skeleton | Runnable demo |
| Memory entries | Minimal (CLAUDE.md, _schema.md, 1 ADR) | Populated (7+ files across 5 categories) |
| Bindings | All unbound | Mix of bound + unbound (shows both) |
| Queue | 1 sample pending | 1 pending + 1 accepted (shows resolution) |
| Audit log | Empty | 6 entries (shows /log page) |
| Use it via | `bbc-cli init my-team` (Phase 7+) | `BBC_REPO=examples/example-tenant pnpm dev` |
