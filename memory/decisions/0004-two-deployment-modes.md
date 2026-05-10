---
id: mem_2026-05-08_adr-0004-two-deployment-modes
type: decision
scope: org
layer: main
source: human:zeth
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
owning_layer: main
tags: [adr, bbc, principles, deployment, multi-tenant, saas, self-host]
status: accepted
---

# ADR-0004: BBC supports two deployment modes — file-based self-host and DB-backed multi-tenant SaaS

## Context

ADR-0001 scoped V1 as **markdown + hierarchy + queue only** — a single-tenant dev tool that lives in one git repo on one host's filesystem, with bash scripts mutating files and a localhost-only dashboard reading via `fs.readFile`.

That scope was the right call for shipping a working brain protocol in days. It is the wrong scope for offering BBC as a product to engineering teams who do not run their own filesystem-resident BBC repo.

Two fundamental properties of V1 break under multi-tenant SaaS:

1. **State location.** V1 says "memory is markdown files in `bbc/memory/`." A SaaS tenant cannot have its own `bbc/memory/` on Zeth's machine — there must be tenant isolation, RLS-gated rows, real backups, and concurrent writes from many machines.
2. **Mutation transport.** V1 says "writes go through `bash propose.sh`/`accept.sh`/`reject.sh`." A web user clicking "Accept" cannot shell out to bash on a multi-tenant host (security, scalability, isolation). Mutation has to be a typed transaction.

Building the SaaS by abandoning files would orphan the self-host community — the AGPL-3.0 license on `github.com/ZethT/bbc` (pushed 2026-05-08) explicitly invites self-hosters. Building the SaaS as a fork would split the protocol into two slowly diverging codebases. Both are bad.

## Decision

**BBC has two deployment modes of the same protocol:**

| Mode | Storage | Transport | Audience |
|---|---|---|---|
| **File-mode** (self-host) | Markdown files on a local filesystem (current V1) | Bash scripts (`propose.sh` / `accept.sh` / `reject.sh`) | Devs running BBC for one team/org on their own host |
| **DB-mode** (managed SaaS) | Postgres tables, RLS-gated, `tenant_id` on every row | Typed SQL transactions invoked from a web/MCP layer | Multi-tenant teams using a hosted dashboard at a `bbc.<tld>` domain |

Both modes implement the same logical contract. The protocol invariants (Memory is the contract; proposals are append-only; vendor names are not architecture; voice is single-source; no silent autonomy) hold in both, expressed differently:

- **"Memory is the contract"** — file-mode stores it as markdown + YAML; DB-mode stores it as a `memory_files` row with `path`, `content`, `frontmatter jsonb`. Same data, different binding.
- **"Proposals are append-only"** — file-mode achieves this by moving files to `_accepted/`/`_rejected/` (filesystem is the audit trail). DB-mode achieves it via an append-only `operations_log` table and a Postgres trigger blocking UPDATE/DELETE on accepted/rejected rows.
- **"No silent autonomy"** — unchanged in both modes. Every state change is still either a human edit at the owning layer, or a queued proposal passing through accept/reject.

The dashboard codebase is **one codebase, two storage backends**, gated behind a `MemoryStore` / `QueueStore` / `LogStore` interface. The two implementations are `LocalStore` (file-mode) and `SupabaseStore` (DB-mode).

The MCP server is a **single binary that talks to whichever store the host is configured for**. Self-hosters run it pointed at their local filesystem; the SaaS runs it pointed at the same Postgres their tenants live in.

## Consequences

### Governance

- **Principle 1 of `bbc/CLAUDE.md` is updated** from "All durable knowledge lives in `memory/` as Markdown + YAML frontmatter" to a mode-aware version: "All durable knowledge is captured by the schema in `memory/_schema.md`. In file-mode, this is materialized as Markdown files under `memory/`. In DB-mode, it is materialized as RLS-gated rows in `memory_files` and related tables. The schema is the contract; the storage is the binding."

- **A new lock-matrix row** governs DB-mode tables: rows where `owning_layer: main` are mutable only via `accept_proposal()` / `reject_proposal()` SQL transactions invoked by an authenticated Main-role session. Row-level security policies enforce this at the DB layer; the application layer enforces the workflow.

- **The `memory/_schema.md` file becomes the canonical contract**, not the file layout. File-mode and DB-mode both derive from it.

- **The `memory/ops/vendors.md` rule still binds.** Vendor names appear only in `bindings.yaml` (file-mode) / `bindings` table (DB-mode) and in adapter YAMLs / adapter rows. Prose elsewhere refers to the role.

- **Principle 6 ("no silent autonomy") is the most-stretched principle in DB-mode.** A multi-tenant Postgres + MCP architecture introduces several constructs that look like autonomy but are not, plus a few that genuinely would be. Explicit ruling per construct:

  | DB-mode construct | Allowed under principle 6? | Why |
  |---|---|---|
  | **Postgres triggers** firing on user-initiated `INSERT`/`UPDATE` | **Allowed.** Triggers are deterministic, in-transaction effects of explicit user actions. Example: the `create_profile_after_insert` trigger from this session's auth migration. | Same logical action as the user's; no separate decision being made by a hidden actor. |
  | **`pg_cron` / scheduled jobs** that mutate `memory_files`, `queue_items`, or any `owning_layer: main` row | **Forbidden.** These are autonomous state-changing actors with no human or named-agent identity. | Indistinguishable from a daemon — the exact thing principle 6 forbids. |
  | **`pg_cron` / scheduled jobs** that refresh materialized views, garbage-collect expired sessions, or rotate API key hashes | **Allowed.** Read-derived or housekeeping work that does not change `memory`/`queue`/`bindings` state. | No protocol-level state change; observable effect bounded to performance/hygiene. |
  | **Outbound webhooks** (Stripe events, Resend send, etc.) triggered by user-initiated transactions | **Allowed.** Same as triggers — effect of an explicit action. | Attribution chain is intact: user → action → webhook. |
  | **Inbound webhooks** (e.g., Stripe paid-event hitting our endpoint) that mutate state | **Allowed only if** the inbound event maps to a named identity in the `operations_log` (e.g., `actor: webhook:stripe:<event_id>`) AND the mutation is constrained to a known-safe surface (`tenants.plan` flip, not arbitrary memory edits). | Without identity + scope constraints, an inbound webhook is autonomy by the back door. |
  | **Supabase Realtime** push of state changes to subscribed clients | **Allowed.** Read-only push; the client decides what to do with the event. | No state change, just a notification surface. |
  | **MCP server tool calls** invoked by an agent on behalf of a user | **Allowed if** each call is independently logged with `actor: agent:<api_key_id>`, the conversation/request ID is captured, and the agent does not invoke a tool the human did not directly authorize within that session. | Attribution is intact; the agent acts as a delegated tool, not an autonomous decision-maker. |
  | **MCP tool chaining** where an agent calls multiple tools in sequence as part of one user request | **Allowed if** the chain is explicitly user-requested (e.g., "go through the queue and accept all the trivial ones") AND each individual tool call still passes the rules above. | Borderline; the safety property is "the user could have invoked each tool themselves and the agent is just batching." |
  | **Auto-accept of proposals** by any rule, schedule, or trained model | **Forbidden, full stop.** This is the principle's namesake forbidden case. | A human or named agent must explicitly invoke `accept_proposal()` for every accept. |

  This table is itself part of principle 6's contract in DB-mode. New constructs not listed here default to forbidden until an ADR adds them. The CLAUDE.md principle 6 wording stays as it is in file-mode; DB-mode's nuance lives here in the ADR and in `memory/tech/deployment-modes.md` §Invariant translation §6.

### Engineering

- The dashboard codebase grows a `src/lib/store/` directory with typed interfaces and two impls. Every existing `fs.readFile` and `child_process.exec` call is replaced with a store-method call.

- The bash scripts (`propose.sh`/`accept.sh`/`reject.sh`) are kept as the **canonical file-mode transport**, not deprecated. DB-mode adds typed transactions alongside, not replaces them.

- A new top-level `mcp-server/` directory implements the agent API. It speaks Anthropic's MCP and exposes `read_memory` / `list_queue` / `propose_change` / `accept_proposal` / `reject_proposal` / `read_log`. Tenant context comes from per-tenant API keys (DB-mode) or a single ambient identity (file-mode).

- Self-host shipping format: `docker compose up` with bundled Postgres. Optional SQLite fallback for solo devs.

### Surface area

- BBC stops being a private dev tool of `<your-tenant>`. It becomes a generic product. The current `tenant-*` family of repos (<<<tenant-app-web>>>, <<<tenant-app-api>>>, bbc-dashboard) are recharacterized as **example applications** that *use* BBC, not as the product itself. The dashboard repo (originally a standalone repo) was renamed/generalized into the apps/dashboard/ workspace; the tenant-specific deployment becomes a tenant inside an `examples/` reference.

- The README of `bbc/` updates to position BBC as a product, with a clear "self-host vs hosted" comparison and a domain link to the SaaS landing.

### Risk

- **Two-mode parity is a forever-tax.** Every new feature must work in both modes or lose the AGPL self-host story. Mitigation: storage interface ships first (Phase 2 of the productization roadmap) and gates everything; nothing bypasses.

- **Schema drift between file-mode and DB-mode.** Mitigation: `memory/_schema.md` is the only source of truth; both modes derive from it. Schema changes require simultaneous updates to file-mode parsers and DB migrations.

- **The MCP API is a public protocol surface as soon as it ships.** Backward-compatibility burden grows from day one. Mitigation: ship a versioned API (`/v1/`) and document deprecation policy explicitly before public launch.

## Supersedes

ADR-0001 ("BBC V1 scope is markdown + hierarchy + queue only") is **extended**, not replaced. V1's principles still hold for file-mode. This ADR adds DB-mode as a peer, not a successor. Both modes coexist indefinitely.

## Source

- `/Users/grid/.claude/plans/i-need-you-to-merry-teacup.md` — productization roadmap (2026-05-08), specifically the architecture decision in §Decisions locked, item 3.
- Conversation thread 2026-05-08 in which user explicitly chose "One repo, two deployment modes" over "Two codebases" and "Multi-tenant only."
- AGPL-3.0 commitment for `github.com/ZethT/bbc` (pushed 2026-05-08), which presupposes a self-host audience worth keeping.
