# /ops operator cockpit — design

Date: 2026-05-17
Status: APPROVED (brainstorm complete, ready for implementation plan)
Reviewers: Claude (proposed), codex consult (sharpened framing), user (approved)

## Problem

User feedback from pre-launch audit (verbatim from
[[project-v18-pre-launch-audit-shipped]]):

> Unified status page (queue + workflows + API + usage) — currently scattered
> across /queue, /library/diagnostics, /settings/keys, /brain — disorienting.

The disorientation is an IA problem, not a "missing dashboard" problem. BBC has
multiple operational surfaces answering adjacent questions, and trusted-teammate
operators have to bounce between them to know whether their BBC needs human
intervention.

## Decision

Build a new operator-cockpit route at `/ops`. Replace `/queue` in nav. Demote
`/library/diagnostics` to an admin deep-link.

Codex framing call: "status" implies passive observability, "ops" implies
trusted teammates running the brain. Route name reflects identity.

## Shape

Single page, two zones, action-inbox biased:

```
/ops
├── Needs Attention            ← actions (top)
│   ├── pending proposals
│   ├── failed/stuck ingestion items (admin sees DLQ)
│   └── missing provider keys
└── System Snapshot            ← glanceable (bottom)
    ├── Queue · N pending · last accepted Xh ago
    ├── Memory · N files · last updated Xh ago
    ├── Providers · N configured · M tested ok
    └── Ingest · N connectors · last sync Xh ago
```

Identity rule for what belongs on /ops: every item must answer either
"does a loop need attention?" or "when did this loop last work?" Anything
else belongs elsewhere.

## Section data sources

All read from existing tables. No new backend.

| Section | Reads | Action |
|---|---|---|
| Proposals awaiting review | `queue_items` where `status=pending` | accept/reject inline (same server actions as today's /queue) |
| Failed ingestion (admin section) | `webhook_dead_letters` count + `tenant_connectors.last_sync_status` ∈ {error, auth_expired} | link to /library/diagnostics for raw rows |
| Missing provider keys | `external_accounts` rows vs. expected providers from `bindings.yaml` | link to /settings/keys |
| Queue snapshot | `queue_items` count + most recent accepted `updated_at` | link to self (top section) |
| Memory snapshot | `memory_files` count + `max(updated_at)` | link to /brain |
| Provider snapshot | `external_accounts` count + last-test timestamps | link to /settings/keys |
| Ingest snapshot | `tenant_connectors` count + `max(last_sync_at)` | link to /library connectors tab |

## Permissions

Single route, conditional admin section.
- Members see: all snapshot rows, proposals queue, missing keys, ingest
  summary without DLQ internals.
- Admins additionally see: DLQ counts row in Needs Attention + admin deep-link
  to /library/diagnostics for raw DLQ rows.

## Honest empty states

Each section MUST render an honest empty state (per
[[feedback-no-placeholders]]):

- Needs Attention empty → "Nothing needs your attention."
- Queue snapshot empty → "No proposals yet."
- Memory snapshot empty → "No memory yet. Add some via /welcome or chat."
- Providers empty → "No provider keys configured." link to /settings/keys
- Ingest empty → "No connectors connected yet — install lands in Phase K."

For 8azi (first real tenant) today: queue may have items if chat ran, memory
will have content from /welcome, providers will reflect /settings/keys, ingest
will be empty until Phase K.

## Out of scope (no-placeholder discipline)

These look natural on a "status page" but cannot be honestly shipped without
prerequisite work. Excluding to avoid creating placeholder debt:

- Reconnect / connect / disconnect buttons on connectors → blocked on Phase K
  (OAuth install flow doesn't exist; see `lib/connectors/framework.ts:419`,
  `installConnector` is never called from any live route)
- Charts, sparklines, usage metrics → dashboard cosplay trap (codex flagged)
- Workflow run history → no workflow runtime exists yet
- Real-time updates / live polling → all existing pages are
  `dynamic = "force-dynamic"` with no client polling; /ops follows that pattern

## Navigation changes

- Add `/ops` to primary nav (probably top slot, since it's the cockpit)
- Remove `/queue` from primary nav
- Add 308 redirect: `/queue` → `/ops` (preserve old URLs / muscle memory)
- Remove `/library/diagnostics` from any nav surface it appears in
  (keep route intact as admin deep-link)

## Files touched (estimate)

New:
- `apps/dashboard/src/app/ops/page.tsx` — server component, reads all sources
- `apps/dashboard/src/app/ops/_components/NeedsAttention.tsx` — top zone
- `apps/dashboard/src/app/ops/_components/SystemSnapshot.tsx` — bottom zone
- `apps/dashboard/src/app/ops/_components/ProposalRow.tsx` — reuses queue accept/reject action
- `apps/dashboard/src/app/ops/styles.css` — page styles (or merge into existing)
- `apps/dashboard/src/lib/ops/read-ops-state.ts` — single aggregating reader
- Tests for the reader + snapshot empty states

Modified:
- `apps/dashboard/src/app/queue/page.tsx` → `redirect("/ops")` 308 (or move to (legacy) route)
- Wherever nav links are defined (search needed) → add /ops, remove /queue
  + /library/diagnostics
- Reuse existing accept/reject server actions from
  `apps/dashboard/src/app/queue/actions.ts` (don't duplicate)

## Risks / open questions for the implementation plan

1. Are accept/reject actions safe to call from `/ops` without changes? They
   shell out to bash scripts in file-mode (per dashboard CLAUDE.md gotchas);
   need to verify they don't assume the caller is on /queue.
2. The "missing provider keys" section needs to read `bindings.yaml` to know
   which providers are *expected* — pattern already exists in
   `apps/dashboard/src/app/library/_providers.server.ts`, reuse it.
3. `tenant_connectors` is empty for real tenants until Phase K. Make sure the
   empty state copy matches the truth (not "0 healthy" which implies they
   should have some).
4. `/queue` is referenced from emails, docs, possibly external links — the
   redirect must work, not 404.

## Next step

Invoke `superpowers:writing-plans` to produce a phased implementation plan
with verification checkpoints.
