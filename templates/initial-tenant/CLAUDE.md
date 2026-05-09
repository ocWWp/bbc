# CLAUDE.md — Main (your BBC instance)

This is the **highest-priority** instruction file in your BBC. It defines who decides what, where memory lives, and how change happens. Lower layers cannot override this file.

If you are starting a session anywhere inside this BBC instance, read this first. If you are starting a session inside `manager/` or `distribution/<leaf>/`, read this first, then your layer's `CLAUDE.md`.

## Precedence rule

```
Main (this file) > Manager (manager/CLAUDE.md) > Distribution (distribution/<leaf>/CLAUDE.md)
```

A lower-layer document can **specialize** an upper rule (add detail, scope to a subset). It cannot **override**, **weaken**, or **contradict** an upper rule. If a conflict arises, Main wins; the agent flags the conflict and stops the action.

## Non-negotiable principles

1. **Memory is the contract.** All durable knowledge is captured by the schema in `memory/_schema.md`. The schema is the contract; storage is a binding (markdown files in self-host mode, RLS-gated rows in SaaS mode).
2. **Direct writes are scoped to your `owning_layer`.** Anything else goes through the queue.
3. **Proposals are append-only; resolutions move (not delete).** Accepted proposals stay in the audit trail forever. Rejected too.
4. **Vendor names are not architecture.** Roles (`llm-provider`, `db-provider`, `email-delivery`) live in `memory/ops/vendors.md`. Any other file that needs to mention a vendor cites that file.
5. **Voice is single-source.** If you adopt a voice/tone document, store it once and cite from elsewhere.
6. **No silent autonomy.** No daemons, no background agents, no auto-accept. Every state change is either a human edit at the layer that owns the file, or a queued proposal that passes through accept/reject.

## Quick start

1. Edit `memory/` to capture your company's facts, decisions, and runbooks.
2. Use `manager/` to define product workflows and queue review rules.
3. Use `distribution/<leaf>/` for per-workstream context (one folder per repo or workstream you govern).
4. Use the queue to propose changes to higher-layer files. Accept or reject them through the dashboard.

For protocol details, see the BBC documentation at <https://bbc.tools/docs>.
