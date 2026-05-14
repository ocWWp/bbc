# Phase O — External inbox producers

**Status:** Planned. Migration `0044` drafted (not applied). Producers not built.
**Belongs to:** The notification surface. Pairs with Loop 1 connectors but is a *distinct* path — see "The distinction" below.
**Predecessor:** `0043_inbox_items` (inbox MVP), and the connector framework (`0025_external_accounts`, `0034_tenant_connectors`, `0036_webhook_dead_letters`, `apps/dashboard/src/lib/connectors/*`).
**Successor:** Per-producer rollout (Slack → email → Linear → GitHub) and the "Inbox" vs "Notifications" naming decision.

## Why this exists

User asked at v1.5 pre-launch: *"Does the inbox contain gmail and stuff like that?"* Answer at v1.5: no. The word "Inbox" sets a Gmail-shaped expectation the product doesn't meet. This phase earns the mental model by adding real external producers. See `project_v16_inbox_external` in session memory.

## The distinction — read this before writing code

BBC already has a **mature connector framework** (`lib/connectors/framework.ts` — Gmail, GitHub, Linear, Notion, Drive, generic webhook, all functional end-to-end). It is easy to assume this phase is "just add Slack to that." **It is not.**

| | Existing connectors (Loop 1) | This phase (Phase O) |
|---|---|---|
| Input | External **content** (docs, emails, issues) | External **events about the user** (@mentions, assignments) |
| Output | `memory_files` rows, status `draft` | `inbox_items` rows, channel `mentions` |
| Purpose | Ingest knowledge into the brain | Notify a person something needs them |
| Review | Queue accept/reject → becomes memory | Mark read; no governance |

Same OAuth APIs, different destination and meaning. Phase O **reuses** the connector framework's plumbing (OAuth credential storage, install flow, cursor/sync-state) but writes through a different path.

## What ships

| Item | What | Status |
|---|---|---|
| `0044_inbox_external_producers.sql` | `source_kind` CHECK gains `slack`/`email`/`linear`/`github`; generic `source_external_id` + `source_external_url` columns; field-lock trigger updated; partial unique index for insert idempotency | ✅ drafted (not applied — see checkpoint) |
| `lib/inbox/producers/<name>.ts` | One file per producer. Pulls events from the external API, maps to `InboxInsert`, writes via `insertInboxItem()` (service-role) | ⬜ |
| OAuth install reuse | Producers authenticate against the same `external_accounts` rows the Loop 1 connectors use — if a tenant already connected Slack for ingestion, the notification producer reuses that credential | ⬜ |
| Trigger mechanism | Per-producer: webhook (Slack Events API, GitHub App, Linear webhook) or polling (Gmail). Webhooks reuse the existing `/api/v1/webhooks/...` route pattern; polling reuses the `runSync` cursor pattern | ⬜ |
| `mentions` tab un-hide | The `mentions` inbox tab is hidden in v1.5 "until a producer exists" — the first producer flips it on | ⬜ |

### Producer write path (the shape every producer follows)

```ts
import { insertInboxItem } from "@/lib/inbox/insert-inbox-item";

// For each external event addressed to a BBC user:
await insertInboxItem({
  tenant_id,
  user_id,                       // resolved: external identity → BBC user
  channel: "mentions",
  kind: "mention",               // or "assignment"
  title: "Sasha mentioned you in #product",
  body: "...the message text...",
  source_kind: "slack",          // new in 0044
  source_external_id: `slack:${channel}:${ts}`,   // stable → idempotent (0044 unique index)
  source_external_url: permalink,
});
```

The `0044` partial unique index on `(tenant_id, user_id, source_kind, source_external_id)` makes a re-run of an incremental sync a no-op insert — producers can be naive about dedup.

## Sequencing

**Slack first.** Per the memory: highest-value producer for early-stage teams. It also exercises both the identity-mapping problem (Slack user → BBC user) and the webhook path, so the second producer is mostly copy-shape.

Then: email (polling, Gmail/Outlook), Linear (webhook), GitHub (App webhook) — in demand order, informed by post-launch usage once PostHog is capturing.

## What is NOT in scope

- **The "Inbox" vs "Notifications" rename.** Open product question (`project_v16_inbox_external`). Phase O makes the rename *unnecessary* by earning the model — but if only one producer ships, revisit. Not decided here.
- **Cross-tenant / org-wide notification rules.** Per-user only, same as `0043`.
- **Changing the connector framework.** Phase O sits beside it, doesn't modify it.
- **Loop 3 fan-out.** That's the `from_bbc` channel; untouched here.

## Open questions

- **Identity mapping** — how does a Slack `U0123` resolve to a BBC `user_id`? Likely a per-user mapping captured at connector install ("which Slack user are you?"). This is the first real design task and gates the first producer.
- **OAuth app registration** — Slack/Linear/GitHub each need a registered app (client id/secret) before any tenant can connect. That's operator paperwork, not code — but it blocks end-to-end testing.
- **Webhook vs poll per producer** — Slack and Linear push; Gmail effectively polls. Confirm before building each.

## Checkpoint — migration apply

`0044` is **drafted but not applied.** It alters the live `inbox_items` table on the production Supabase project. Applying it is a deliberate, gated step:
- Review the migration.
- Apply via the Supabase MCP `apply_migration` or the project's migration workflow.
- `0044` is additive (new columns nullable, widened CHECK, new index) — safe on a populated table, no backfill needed. But it still touches prod, so it's a conscious go, not an auto-step.
