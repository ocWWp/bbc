# CLAUDE.md — Main (Acme Co's BBC)

**Highest-priority instruction file in this BBC tenant.** Defines who decides what, where memory lives, and how change happens. Lower layers cannot override this file.

## Precedence rule

```
Main (this file) > Manager (manager/CLAUDE.md) > Distribution (distribution/<leaf>/CLAUDE.md)
```

Lower-layer documents can **specialize** an upper rule (add detail, scope to a subset). They cannot **override**, **weaken**, or **contradict** an upper rule.

## Non-negotiable principles

1. **Memory is the contract.** All durable knowledge is captured by the schema in `memory/_schema.md`. The schema is the contract; storage is a binding (markdown files in self-host mode, RLS-gated rows in SaaS mode).
2. **Direct writes are scoped to your `owning_layer`.** Anything else goes through the queue.
3. **Proposals are append-only; resolutions move (not delete).** Accepted proposals stay in the audit trail forever.
4. **Vendor names are not architecture.** Roles (`db-provider`, `llm-provider`, `email-delivery`) live in `memory/ops/bindings.yaml`. Other files reference the role; only adapter YAMLs and the bindings table name vendors.
5. **Voice is single-source.** `memory/design/voice-tone.md` is canonical. Cross-repo voice anchors (if Acme had any) would be downstream consumers.
6. **No silent autonomy.** No daemons, no background agents, no auto-accept. Every state change is either a human edit at the layer that owns the file, or a queued proposal that passes through accept/reject.

## What this tenant is

Acme Co is a fictional 3-person SaaS startup running BBC to manage their company brain. They've adopted BBC for:

- Proposal-style change management (decisions go through the queue)
- A single source of truth for voice + brand
- Vendor-binding tracking (which provider does each role today)
- Agent-readable memory so their AI tools have consistent context

They have **one Distribution leaf** so far (`distribution/example-leaf/`). When they spin up a real frontend or API repo, they'll add more leaves.

## What this tenant is NOT

- Not a real company (Acme Co is illustrative)
- Not running production traffic (this is a demo dataset)
- Not the BBC product itself (BBC is at the parent monorepo `apps/dashboard/`, `apps/mcp-server/`, etc.)

## Quick start (for Acme team members opening this in Claude Code)

1. Read `memory/_schema.md` for the frontmatter contract.
2. Read this file again — Main rules apply to every change.
3. To file a change: `bash ../../scripts/propose.sh --target main --file ... --kind edit --summary "..."`.
4. Read `memory/ops/bindings.yaml` for what's bound today.
