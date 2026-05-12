# BBC — the brain for your startup

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL_v3-blue.svg)](LICENSE)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#status)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ZethT/bbc)

**Stop re-explaining your company to every AI tool.** BBC is a structured brain — your positioning, voice, decisions, team, vendors — that every AI tool you use can read from. One source of truth. Self-hosted by default. AGPLv3.

> Marketing Studio screenshot goes here once we ship a real GIF.

## Why BBC exists

Every founder I know wastes half a day every week re-pasting the same context into ChatGPT, Cursor, Jasper, Notion AI. Your company exists in your head; the AI tools don't know it. So every output sounds generic and you spend the rest of the week fixing it.

BBC fixes that. You give it your brain once. Every AI tool — including the Marketing Studio built into BBC — generates content that sounds like *you*, grounded in the actual memories you typed, with citations back to the source.

**The pitch in three bullets:**

- **Your data is yours.** AGPLv3. Self-hostable. No telemetry. We can't sell it to OpenAI even if we wanted to.
- **Every output cites a memory.** No hallucinated launch dates. No invented metrics. Every claim points back at something you typed.
- **Built for solo / early-stage founders.** Not "AI memory for everyone." Specifically for the founder who's doing every job at once.

## Quick start

### Option A — Deploy to Cloudflare (5 minutes)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ZethT/bbc)

You'll need:
- A free Supabase project ([supabase.com](https://supabase.com))
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- 32 bytes for the BYOK encryption key — run `openssl rand -base64 32` and paste it
- A free Cloudflare account ([cloudflare.com](https://cloudflare.com))

The Cloudflare deploy button forks the repo, provisions a Worker via [@opennextjs/cloudflare](https://opennext.js.org/cloudflare), and prompts you for env vars. After it deploys you'll get a `*.workers.dev` URL.

Then run the migrations in `apps/dashboard/supabase/migrations/` against your Supabase project (Studio → SQL Editor → paste + run each `0001..0026` file in order).

Prefer the CLI? After cloning + filling in `.env.local`:

```bash
pnpm install
pnpm --filter @bbc/dashboard cf:build    # build with the OpenNext Cloudflare adapter
pnpm --filter @bbc/dashboard cf:preview  # local Workers preview
pnpm --filter @bbc/dashboard cf:deploy   # ships to Cloudflare
```

Env vars go in the Cloudflare dashboard (Workers & Pages → bbc-dashboard → Settings → Variables) or via `wrangler secret put`. See `apps/dashboard/wrangler.toml` for the list.

### Option B — Local self-host

```bash
git clone https://github.com/ZethT/bbc.git
cd bbc
cp .env.example .env       # fill in Supabase + Anthropic + encryption key
pnpm install
pnpm --filter @bbc/dashboard dev
# http://localhost:3000
```

The dashboard defaults to the Acme Co demo tenant in `examples/example-tenant/`. To use your own tenant repo:

```bash
BBC_REPO=path/to/your-tenant pnpm --filter @bbc/dashboard dev
```

### Option C — Try the hosted demo

[bbc.tools](https://bbc.tools) is a maintainer-funded hosted instance running on Cloudflare with a small daily cap on AI runs. Free to try; bring your own API key to remove the cap. **This is not a SaaS** — there's no billing relationship; per [ADR-0007](memory/decisions/0007-oss-first-agpl-deferred-commercialization.md) BBC takes no revenue in v1.

## What's in v1

The hero feature is the **Marketing Studio** at `/studio/marketing`. Type one sentence ("draft a launch tweet for v1.0"), pick a workflow from 2-4 BBC suggests, fill 1-2 inputs, get a live X / Threads / LinkedIn / Blog / Script preview that cites the memories that shaped it.

Other surfaces:
- `/welcome` — paste a brain dump or any URL; BBC extracts typed memories (voice, product, decisions, team, vendors)
- `/memory` — Notion-style editor for every memory
- `/marketplace` — provider directory; which adapter is active for which role
- `/settings/keys` — BYOK manager (encrypted server-side, never sent back to the browser)
- `/queue` — every change to memory goes through proposal + accept; full audit trail
- `/graph` — relations between memories

Full design: [docs/plans/2026-05-10-bbc-user-facing-product-design.md](docs/plans/2026-05-10-bbc-user-facing-product-design.md). Architecture decisions: [memory/decisions/](memory/decisions/).

## Status

**Alpha.** Breaking changes are possible. Phase J (Marketing Studio v1) is the most recent major milestone; Phase K (BYOK + marketplace + self-host) is in progress. Roadmap in [`.planning/ROADMAP.md`](.planning/ROADMAP.md).

If you self-host today: expect to re-run migrations occasionally. Schema is stable enough for daily use but not frozen.

## License

[AGPLv3](LICENSE). You can self-host BBC freely, modify the code, and run it for your team. If you offer BBC as a hosted service to others, your modifications must also be open-sourced under AGPL. This is the same license [Plausible](https://plausible.io) and [Cal.com](https://cal.com) use, for the same reason: keeps the project free for users while preserving a future commercial path for the maintainer.

Why AGPL specifically: see [ADR-0007](memory/decisions/0007-oss-first-agpl-deferred-commercialization.md).

## Contributing

Bug reports, PRs, and design discussions welcome on GitHub. No CLA — contributors retain copyright on their commits, all under AGPLv3.

For substantive design changes: open an issue first so we can talk through the architecture before code lands. BBC has strong opinions about how memory + the proposal queue work; PRs that fight those will get pushed back.

## Architecture (skip unless you want to know)

BBC is built around three ideas:

**1. Memory is the contract.** Every durable fact lives in a typed supertag — `voice`, `decision`, `product`, `vendor`, `team`, `glossary`, `skill`. The schema is canonical (`memory/_schema.md`); storage is either markdown files (self-host) or RLS-gated Supabase rows (hosted) — same schema either way.

**2. Three-layer governance.** Some rules are tenant-specific (your design system). Some are organizational (your product workflow). Some are universal (BBC's protocol invariants). Each rule has an owning layer; lower layers can specialize but not override:

```
Main      (CLAUDE.md)               principles, locked from below
  └─ Manager (manager/CLAUDE.md)    product workflow, queue review
       └─ Distribution (distribution/<leaf>/CLAUDE.md)   per-workstream context
```

A leaf that wants to change a higher-layer rule files a **proposal** in `queue/`. Manager reviews. Main accepts. Proposals are append-only; resolutions move (not delete). That is the entire write protocol.

**3. Providers are pluggable.** Roles (`llm-provider`, `db-provider`, `email-delivery`, `video-gen`, etc.) live in `memory/ops/provider-roles/`. Concrete vendors implement those roles in `memory/ops/providers/<vendor>.yaml`. A `bindings.yaml` maps role → active vendor. Swapping Anthropic for OpenAI, or Resend for Postmark, is a binding edit — nothing else needs to change.

## Repo layout

```
bbc/
├── CLAUDE.md                       Main precedence + lock matrix
├── AGENTS.md                       LLM agent cheat-sheet
├── apps/
│   ├── dashboard/                  Next.js dashboard (@bbc/dashboard)
│   └── mcp-server/                 MCP bridge
├── packages/store/                 typed storage interface
├── memory/
│   ├── _schema.md                  frontmatter contract
│   ├── decisions/                  product ADRs
│   └── ops/
│       ├── provider-roles/         role contracts
│       └── providers/              vendor adapter YAMLs
├── manager/                        Manager rules + agents
├── distribution/<leaf>/            per-workstream context
├── templates/initial-tenant/       forkable tenant skeleton
├── examples/example-tenant/        runnable Acme Co demo
├── scripts/                        bash protocol scripts
└── docs/                           operating-bbc.md, plans/, research/
```

## Operating docs

- [`docs/operating-bbc.md`](docs/operating-bbc.md) — Supabase setup, daily-use loop, mode switching
- [`docs/tenant-repo-architecture.md`](docs/tenant-repo-architecture.md) — fork the tenant template
- [`AGENTS.md`](AGENTS.md) — what an LLM agent should know when it opens a session here
- [`apps/dashboard/README.md`](apps/dashboard/README.md) — dashboard dev notes
- [`apps/mcp-server/README.md`](apps/mcp-server/README.md) — MCP server dev notes

## Slash commands (Claude Code)

When a Claude Code session opens anywhere in the BBC tree, these are auto-discovered:

```
/bbc:help              list all commands
/bbc:status            where am I, what's pending
/bbc:propose           file a queued change
/bbc:review            Manager triages the queue
/bbc:accept            Main applies an approved proposal
/bbc:dashboard         surface the dashboard URL
```

Global install (commands available outside the BBC tree):

```bash
bash scripts/install-skills.sh
```

Bash equivalents always work:

```bash
bash scripts/propose.sh --target main --file memory/<path> \
     --kind edit --summary "..." --source "..." --body-file <path>
bash scripts/accept.sh <proposal_id>
bash scripts/reject.sh <proposal_id> --reason "..."
```
