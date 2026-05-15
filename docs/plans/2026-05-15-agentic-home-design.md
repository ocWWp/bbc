# v1.6 — Agentic /home + Loop 3 observer (revised after codex review)

**Status:** DRAFT v3 — second codex pass landed 6 FIXED / 8 PARTIAL / 7 NEW. v3 closes the architectural NEW items inline; remaining PARTIAL items become PLAN.md acceptance criteria.
**Date:** 2026-05-15
**Phase:** v1.6 ("agentic loop", scope cut from v1.6+v1.7 after codex review)
**Estimated effort:** ~7 weeks across 6 milestones (was 6; M3 and M4 unstacked per codex #11).
**Prerequisite:** Phase M scope ADR (`memory/decisions/0009-phase-m-scope.md`) — written as M0, lands before any code.

## Revision log

### v3 — second codex pass

Re-codex resumed session `019e2d04-d11a-7660-8b28-7d369d916c7a` and verified the 14 prior concerns: 6 FIXED, 8 PARTIAL, 0 WORSE. 7 new issues surfaced; v3 closes architectural ones inline (queue-first observer flow, atomic quota RPC, three-step consent without external calls, manual-run auth, turn persistence lifecycle, accept RPC for observations). Implementation-detail PARTIALs (per-table RLS, claim-parser, library statelessness contract) move to PLAN.md acceptance criteria.

### v2 — first codex pass

Codex consult on the v1 draft surfaced 14 substantive concerns (session `019e2d04-d11a-7660-8b28-7d369d916c7a`). All applied:
- Agent primitive split into libraries, not a single runtime (codex #1)
- Storage realigned with ADR-0008: durable observer findings live in `memory_files`; only ephemeral session + scheduler state lives in dedicated tables (codex #2, #12)
- Observation proposals use existing `change_kind='add'` against new memory rows, not a fictional `kind` column (codex #3)
- SSE moved from server action to a Route Handler (codex #4)
- Three-step consent (propose → confirm setup → enable) replaces silent registration (codex #6)
- Grounding verifier replaces citation stripping (codex #8)
- Cron deferred to v1.7; v1.6 ships manual-trigger observer (codex #5, #11)
- DB-enforced quotas added (codex #7)
- Cold-start greeting becomes template-driven, no page-load LLM call (codex #13)
- Phase M ADR reframed as capability classes, not vendor whitelist (codex #10)
- Anomaly detection scope cut to Z-score + minimum-sample; seasonality/drift deferred (codex #9)
- v1.6 tools explicitly marked internal-only; durable tool envelope is v1.7 work (codex #14)

## Why

Phase P Step 2 shipped a Read-vs-Make intent toggle on /home. User reaction (2026-05-15): *"it doesn't feel like AI at all."* Canonical reproduction: asked "where is the admin dashboard?", got `no matches` empty state. The page is a smarter search box, not an agent.

ADR-0008 (three-loop architecture) frames /home as the **Loop 2 (Act)** surface, with **Loop 3 (Improve)** as the larger goal: BBC observes operational signal and files improvement proposals back into the queue. v1.6 ships:
1. A **conversational /home** so the surface feels like AI
2. A **manual-trigger observer** that watches one signal source (PostHog) and files proposals via existing queue machinery
3. The **Phase M scope ADR** that makes Loop 3 work defensible

Cron-driven autonomous observation is v1.7. We need the conversational shell, the queue plumbing, and the governance gates working in production before automating the loop.

Launch demo story (achievable in v1.6): *"Watch our churn rate. [user clicks Set up watch, then Enable] [user later clicks Run check now] BBC found churn up 12% this week and filed a proposal in /queue with three likely causes from your memory. You accept; the finding lands as durable memory."*

v1.7 finishes the story by running that loop hourly without the user pressing a button.

## What we're NOT building in v1.6

- **Cron / scheduled observer.** Manual trigger only. v1.7 adds Cloudflare Cron Triggers.
- **External action execution** (browser-use, send-email, API write tools). v1.7+.
- **Cross-tenant benchmarks.** Forbidden by Phase M ADR. Future amendment may open.
- **Hermes-agent runtime.** Revisit at v1.8+.
- **Multiple chat sessions / left rail.** Single rolling conversation.
- **Read/Make UI toggle.** Deleted. Agent classifies intent server-side.
- **Sophisticated anomaly detection.** v1.6 ships Z-score + minimum sample. Seasonality, drift, cyclic-pattern handling → v1.7.
- **Durable tool execution envelope.** v1.6 tools are internal-only. v1.7 designs the durable envelope (idempotency, retries, sandbox, audit).

## Architecture

### Shared libraries (not a runtime)

`apps/dashboard/src/lib/agent/` exports composable libraries. The two invocation paths import what they need.

- **`AgentContextBuilder`** — assembles role pack (voice + vendors + decisions + glossary) + observation buffer + always-on memory excerpt + workspace identity. Returns a structured `AgentContext`.
- **`ToolRegistry`** — defines the v1.6 tool kit: `memory_search`, `memory_fetch`, `route_match`, `studio_compose`, `observer_propose`, `observation_emit`. Each tool has a declared scope (read-only memory, write to specific table, etc.). Marked **internal-only** for v1.6 — v1.7 designs the durable envelope before opening to browser-use et al.
- **`GroundingVerifier`** — post-LLM step. Parses generated text for factual claims. Each claim must map to a retrieved memory ID. If the LLM invents an ID not in the result set, the verifier removes the claim (not just the chip) and replaces it with a fallback: *"I found these related memories: [chips]"*. The verifier's job is to **prevent confident ungrounded answers**, not to hide them.
- **`ProposalEmitter`** — files queue items via the existing `propose_change` RPC. For observer findings, this means `change_kind='add'` with a target path under `memory/observations/<id>.md` and the finding's frontmatter + body.
- **`QuotaGate`** — checks per-tenant quotas before LLM calls; updates `tenant_quotas` row with token cost after. Throws if budget exhausted.

### Two orchestration paths

- **`homeTurn(sessionId, userText)`** — user-authenticated. Validates session, runs through QuotaGate, builds context, classifies intent, picks tool subset, invokes LLM with streaming, runs GroundingVerifier on the response, returns SSE event stream. Abortable. Latency-sensitive.
- **`observerRun(tenantId, signalId, options)`** — service-actor identity. Idempotent on `(signal_id, window_start)`. Polls PostHog, computes anomaly, runs through QuotaGate, builds context with `observe-anomaly` intent, invokes LLM, runs GroundingVerifier, emits memory file + proposal. Retries on transient failure, logs to `observer_runs`. **In v1.6 invoked only from `POST /api/observer/run-now/:signalId`** by an authenticated tenant user. v1.7 also invokes from cron.

Same libraries, separate orchestration. No mode flags.

### Agent turn (steps)

```
1. quota gate   →  2. assemble context  →  3. classify intent
              →  4. pick tools  →  5. invoke LLM  →  6. verify grounding  →  7. emit
```

- **Classify intent.** Dedicated Haiku-tier call over latest user input + last 2 turns. Outputs: `navigate | explain | draft | watch | meta | unclear`. Async path skips this (intent is fixed: `observe-anomaly`).
- **LLM call.** Single Sonnet-tier streaming call. Tool calls executed server-side, results looped back. **Loop cap: 4 iterations per turn.** Provider per tenant binding (BYOK or shared maintainer key).
- **Verify grounding.** Memory IDs in response checked against actual retrieved IDs. Ungrounded claims downgraded.
- **Emit.** Typed SSE events: `text-delta`, `action-card`, `citation`, `proposal-filed`, `turn-end`.

## /home conversational shell

- **Single composer**, no mode toggle. Placeholder rotates examples. ⌘+Enter to send.
- **Reply turns stream in** via SSE. Heterogeneous content: text + inline action cards + memory citations.
- **Action cards** — agent NEVER executes side effects silently. `[Open /dashboard →]`, `[Draft now →]`, `[Set up this watch →]` — clicking grants permission per action.
- **Memory citations** — clickable chips at bottom of agent turn. Each chip is a verified ID from the retrieved set (GroundingVerifier enforces).
- **Single rolling session.** Tables `home_sessions` + `home_turns`. New chat archives old. 30-day inactivity auto-archive.
- **Cold-start greeting — template-driven.** Server-side query counts: recent observations, active signals, pending queue items. Template renders without an LLM call: *"3 watches active. 1 new finding since yesterday. What would you like to do?"* LLM only invoked when the user types.
- **"Watching" strip** — persistent top strip showing enabled signals as chips. Click expands into a focused conversation about that metric.

## Observer subsystem (Loop 3 — manual trigger in v1.6)

### Three-step consent (codex #17 fix: zero external calls in step 1)

1. **User says "watch our churn rate" in /home** → agent's intent classifier picks `watch` → calls `observer_propose` tool. **The tool uses only local connector metadata** (PostHog adapter's static metric catalog, baseline-method templates, cost-model formulas) — no calls to PostHog, no LLM beyond the in-flight turn, no DB writes. Returns a preview spec: metric name, source, threshold default, cadence default, estimated tokens/run, data scope. Agent emits an action card.
2. **User clicks `Set up this watch`** → server action persists `observer_signals` row with `enabled=false` AND performs the first external validation call (PostHog metric existence + permissions). If validation fails, the row is rolled back and the user sees the error.
3. **User clicks `Enable watching`** (from /settings/observers or the action card) → row updates `enabled=true`. No further external calls until first run.

No silent state changes. No external surface touched before explicit user setup click.

### Manual run (codex #19: auth model)

`POST /api/observer/run-now/:signalId` is gated on `requireRole(actor, "operator")` (same gate as existing queue accept). The handler verifies `signalId` belongs to `actor.tenantId` and the signal is `enabled=true`. `observer_runs` records both `requested_by` (authenticated user ID) and `executed_by` (service actor performing the PostHog call). v1.7 cron invokes the same code path with `requested_by=null` and `executed_by='cron'`.

### Anomaly detection (v1.6 scope)

- **Method:** Z-score over rolling window. Configurable per signal: `(window_days, baseline_days, z_threshold)`.
- **Minimum sample.** Skip if either window has fewer than `min_samples` data points.
- **Cooldown.** Max 1 proposal per signal per 24h.
- **What's deferred to v1.7:** matched-window comparisons (Mon vs prior Mons), seasonality, gradual drift, anomaly classes (spike/drop/sustained/missing), digest mode.

### Observer flow → queue-first, memory-on-accept (codex #15 resolution)

The earlier draft created a `memory_files` row with `status='proposed'` before queue acceptance. Codex's second pass flagged this leaks half-baked findings into citation surfaces. **Revised: no memory row exists until accept.** Findings are staged inside the queue item itself; accept promotes them.

1. `observerRun` polls PostHog for the metric's current + baseline windows.
2. Computes Z-score; if outside threshold and sample sufficient → continue.
3. Builds anomaly context: metric, delta, baseline, retrieved memory (decisions, prior observations) for hypothesis grounding.
4. Invokes agent with `observe-anomaly` intent → LLM generates hypothesis text + identifies relevant memory citations.
5. `GroundingVerifier` strips ungrounded claims.
6. **Stages the finding in `observer_runs.staged_finding`** (jsonb): full memory frontmatter + body + citation IDs the eventual memory_files row will carry.
7. **Files a queue item via `propose_change`** with `change_kind='add'`, target_path = `memory/observations/<run_id>.md` (the path the row will land at on accept), body = the staged finding, frontmatter extended with `observer_run_id` (codex #16 fix).
8. Logs `observer_runs(signal_id, ran_at, window_snapshot, anomalies_jsonb, proposals_filed, staged_finding, llm_call_id)`.

**Accept path.** M3 adds `accept_proposal_observation()` RPC (or amends existing `accept_proposal()`): atomically creates the `memory_files` row from the queue item's body, sets status `accepted`, marks queue item `accepted`, appends to `operations_log`. Until that RPC runs, **no memory_files row exists** — findings cannot leak into `/home` citations or memory search.

**Reject path.** Queue item marked rejected. observer_runs row retained for audit. No memory_files row ever created.

This removes the "proposed memory" lifecycle entirely. `memory_files.status` doesn't need a new value; queue is the proposal lifecycle.

### "How BBC found this" rendering

Queue detail page reads the linked memory file's frontmatter. If the source type is `observation`, the detail page renders an additional section:
- Signal source + metric name
- Anomaly summary (delta, baseline, window)
- Citations (memory chips, already in the proposal body)
- Run ID linking to `observer_runs/:id` for the operational trace
- LLM call ID (for debugging; permissioned to admin only)

## Storage

### New tables (operational only — ephemeral / scheduler state)

```sql
home_sessions     (id, tenant_id, user_id, started_at, last_activity_at, archived_at)
home_turns        (id, session_id, role, content_jsonb, created_at)
observer_signals  (id, tenant_id, signal_type, config_jsonb, enabled, created_at, created_by)
observer_runs     (id, signal_id, ran_at, window_snapshot, anomalies_jsonb, proposals_filed, llm_call_id)
tenant_quotas     (tenant_id, period_start, tokens_used, turns_count, signals_active, runs_today, updated_at)
```

All RLS-scoped per tenant. All append-only or audit-rich per the existing `operations_log` pattern. RLS tests required for each.

### What lives in memory_files (per ADR-0008)

- **Observer findings** — new type `observation`. Body contains the hypothesis text + citations. Status field tracks proposed/accepted/rejected, same as other memory items.
- **Conversation turns are NOT memory** — they're ephemeral session state. They never enter the memory contract.

### Existing tables touched

- `queue_items` — observer proposals use existing `change_kind='add'` shape. No new column.
- `operations_log` — every state change in observer flow appends here, same as queue accept/reject.

### Bindings

- `bindings.yaml` per tenant grows `observer.{signal_type}.enabled` flag (mirror of `observer_signals.enabled` for the role-tool-bundle lookup path).

## Wire protocol

**Route handler, NOT server action.** SSE wants raw `Response` with `text/event-stream`; server actions can't reliably do that under OpenNext Workers.

```
POST /api/home/turn
  body: { sessionId, userText }
  auth: cookie session validated via requireActor()
  response: text/event-stream
    event: text-delta      data: {delta}
    event: action-card     data: {kind, payload}
    event: citation        data: {memoryId, label}
    event: proposal-filed  data: {queueItemId, memoryFileId}
    event: turn-end        data: {turnId}
```

Server actions still handle **mutations**: enabling a signal, archiving a session, etc. The SSE path is only for the streaming agent turn.

Client (`ChatHome.tsx`) uses `fetch()` + `ReadableStream.getReader()` to consume. Abort via `AbortController` if the user cancels.

### Turn persistence lifecycle (codex #20 fix)

The streaming endpoint writes `home_turns` rows at four points so transcript state survives abort/disconnect:

1. **Before LLM call** — insert the user's turn (role=user, content_jsonb={text}).
2. **At first `text-delta`** — insert the assistant's turn (role=agent, status=`in_progress`, content_jsonb=empty). Allocate the `turnId` here so `turn-end` can finalize it.
3. **On each tool call / action card / citation** — append to the in-progress assistant row.
4. **On `turn-end`** — set status=`completed`. On disconnect mid-stream (AbortController fires or socket closes) — set status=`aborted`. On LLM error — status=`failed` with error message.

Recovery: when /home loads, in-flight turns appear with their current state; aborted/failed turns render a "this turn was interrupted" banner.

**M1 includes a hard streaming spike.** Before any UI work, prove the route handler streams correctly through `wrangler dev`, deployed Workers, and OpenNext production build. Verify: cookie auth, abort behavior, Anthropic streaming passthrough, mobile reconnect, no buffering. **Spike outcome is a hard gate.** If SSE doesn't work under OpenNext, fall back to long-polling and re-cost.

## Governance — Phase M scope ADR (M0)

**Locked before any code.** Reframed from vendor whitelist to **capability classes** (per codex #10):

### Capability class 1: read-only signal adapter

Any future signal source must implement this class. Declared properties:
- **Scope** — what data the adapter reads (metric series, logs, tickets, etc.)
- **Retention** — how long observer_runs snapshots persist (default: 365 days)
- **PII policy** — whether the data contains PII; if yes, what redaction happens before LLM context assembly
- **Baseline method** — how anomalies are computed against historic data
- **Kill-switch** — per-signal `enabled` flag, default `false`
- **Cost model** — estimated tokens per run, used by QuotaGate

In v1.6 there is **one** adapter: `posthog.metric`. Adding `linear.tickets` or `github.deploys` in v1.7 doesn't require an ADR amendment, just an adapter conforming to the class.

### Hard constraints

- **No external writes** — observer cannot send emails, call APIs, write to external systems. Only `proposal_emit` allowed, which routes through the existing queue gate.
- **No cross-tenant aggregation** — analytics rows never cross tenant scope; RLS-enforced.
- **No autonomy past queue** — every proposal waits for human accept/reject.
- **No silent state changes** — every persisted observer_signals row requires explicit user click.

### What the ADR does NOT lock

- Vendor choice for any capability class. Switching from PostHog to Plausible doesn't need an ADR.
- LLM provider choice — already governed by bindings.
- Anomaly detection method per signal — declared in adapter, free to evolve.

## Permission model — three gates

1. **Propose** — agent's `observer_propose` returns a preview action card. **No persistence.** User sees the proposed watch with metric, threshold, cadence, cost estimate, data scope.
2. **Set up** — user clicks `Set up this watch` → `observer_signals` row created with `enabled=false`.
3. **Enable** — user clicks `Enable watching` → row updates to `enabled=true`. Observer runs (when manually triggered in v1.6, or cron in v1.7) reference only enabled rows.

Plus the existing queue gate (human accept/reject) for every observation proposal.

## Quotas (codex #7)

`tenant_quotas` rolling daily window per tenant:
- `tokens_used` — total LLM tokens (input + output, weighted) consumed today
- `turns_count` — /home turns today
- `signals_active` — count of enabled observer_signals
- `runs_today` — manual observer runs today

Hard caps (configurable, sensible defaults):
- `max_tokens_per_day` — default 1M (covers a busy day; tenants can raise via support)
- `max_turns_per_user_per_hour` — default 60 (one per minute average)
- `max_active_signals` — default 10
- `max_runs_per_signal_per_day` — default 24 (one per hour-equivalent; supports v1.7 cron without re-tuning)

QuotaGate runs before every LLM call. If exhausted: chat returns "budget exhausted, resets tomorrow" message; observer skips run + logs the reason.

**Concurrency (codex #18 fix).** Pre-check-then-post-update races under concurrent streaming turns. The implementation is an atomic `reserve_quota(tenant_id, user_id, estimated_tokens, kind)` RPC that increments a counter under a row lock and returns success/exhausted; a follow-up `reconcile_quota(reservation_id, actual_tokens)` adjusts the count after the LLM call returns. No naive `SELECT ... UPDATE`. Tests at M4 must include concurrent-turns + observer-runs hitting the same tenant.

## Milestones (~7 weeks)

| ID | Subject | Duration | Outputs |
|---|---|---|---|
| M0 | Phase M scope ADR + capability class spec + migration policy table | week 1 | `memory/decisions/0009-phase-m-scope.md` accepted; per-table RLS/retention/mutation policy documented |
| M1 | Agent libraries + GroundingVerifier + SSE Route Handler spike | weeks 2-3 | `lib/agent/` exports, `POST /api/home/turn` working through deployed Workers, unit tests with mocked Anthropic. **Spike outcome is hard gate.** |
| M2 | /home chat shell + template greeting + home_sessions/turns + persistence lifecycle | weeks 3-4 | New ChatHome consuming SSE, action card vocab, citation chips, GroundingVerifier integrated, turn persistence + abort recovery |
| M3 | Observer manual-run + queue-first flow + accept RPC | week 5 | PostHog adapter, anomaly Z-score, `observerRun()`, `POST /api/observer/run-now/:id`, queue proposals via `change_kind='add'`, new `accept_proposal_observation()` RPC that promotes staged finding → memory_files atomically |
| M4 | /settings/observers UI + three-step consent + atomic quota RPC | week 6 | Settings page, propose→setup→enable flow, `reserve_quota`/`reconcile_quota` RPCs, concurrency tests |
| M5 | Polish + second codex review + Cloudflare deploy | week 7 | E2E demo flow, codex review on final diff, voice review, release notes, deploy |

Milestones are sequential — codex #11 flagged the prior overlap of M3 and M4 as the most likely slip point.

## Risks (revised, prioritized)

1. **SSE on Cloudflare Workers fails under OpenNext** — hard M1 gate. Fallback: long-polling with same event shape.
2. **GroundingVerifier is too aggressive or too lenient** — initial config: claim must map 1:1 to a retrieved memory ID *or* be marked as inference. Tune via voice review pass at M5.
3. **Quota hard caps wrong for real usage** — start conservative, monitor, raise per tenant via support. Better than runaway cost.
4. **Memory_files supertag `observation` creates schema confusion** — design M0 includes the supertag definition (mirror existing `decision`/`note`/`vendor` shape).
5. **Anomaly false positives even with Z-score** — manual trigger in v1.6 reduces blast radius. User explicitly clicks "Run check now"; storms are deferred until cron lands in v1.7 with better detection.
6. **Tenant deletion cascade** — RLS tests for all 5 new tables. M2 + M3 acceptance criteria include cascade tests.
7. **Cold-start greeting still feels generic** — accepting some genericness as the trade for cost predictability. v1.7 may add an LLM-tier "deep greeting" gated by user click.

## Success criteria (v1.6 launch demo)

A new tenant can:
1. Sign in, land on /home with template-rendered greeting
2. Type "watch our churn rate" → agent returns a preview card (no persistence yet)
3. Click `Set up this watch` → signal saved disabled
4. Click `Enable watching` → signal active
5. Click `Run check now` → observer runs synchronously; if anomaly, proposal lands in /queue with linked memory file
6. Open /queue → see "How BBC found this" section; review hypothesis + citations
7. Accept → memory file promoted; conversation in /home can now cite it
8. Reject → memory file archived; observer_runs retains the trace

If a stranger does all eight in twelve minutes without confusion, v1.6 ships.

## PLAN.md acceptance criteria (codex partial-fixes)

These are too detail-heavy for the design doc but must land in PLAN.md before M1 starts:

- **Per-table mutation policy** (codex #2, #12) — for each of `home_sessions`, `home_turns`, `observer_signals`, `observer_runs`, `tenant_quotas`: explicit RLS policy SQL, append-only vs mutable fields, retention policy, RPC ownership, tenant-deletion cascade behavior. Test cases for each.
- **`accept_proposal_observation()` RPC migration** (codex #3) — exact SQL: extends existing accept flow OR new RPC dispatched on proposal frontmatter kind. Decision and SQL go in M3's PLAN.
- **`reserve_quota`/`reconcile_quota` RPCs** (codex #7, #18) — concrete signatures + row-lock strategy + concurrent-load test.
- **`require_actor` inside long-lived Route Handler** (codex #4) — verify cookie session refresh behavior under streaming; document whether middleware refresh races with handler reads.
- **Internal write tool audit shape** (codex #14) — for `observation_emit` and `ProposalEmitter`: idempotency keys (`(signal_id, window_start)` is natural for observer; need one for chat-driven proposals too), what `operations_log` entries get written, replay safety.
- **GroundingVerifier claim-parser implementation** (codex #8) — initial cut: regex over citation markers `[mem:<id>]` in LLM output; verifier rejects any unmarked factual claim. Tighten later via voice review pass.
- **Library statelessness contract** (codex #1 caveat) — `lib/agent/` exports must be pure functions; explicit DB clients injected, no module-level mutable state.
- **`proposal_frontmatter.observer_run_id`** (codex #16) — extend the frontmatter schema; existing queue detail page renders it conditionally.

## Open questions (genuine product decisions, deferred to PLAN.md)

- Does "Today at a glance" dashboard surface observer findings as cards?
- Mobile chat UX — fix the existing `<860px` burger menu regression here regardless
- File upload / pasted screenshot support in chat — defer to v1.7
- Per-tenant LLM cost display UI — surfaces in /settings/keys or new /settings/usage page?
- Memory supertag `observation` vs reuse `note`/`incident` — decide in M0 ADR

## v1.7 preview (not in scope)

- Cloudflare Cron Triggers + per-tenant lease + scheduled observerRun
- Anomaly model improvements (matched windows, seasonality, anomaly classes)
- Additional signal adapters (Linear tickets, GitHub deploys)
- Durable tool execution envelope (browser-use, send-email)
- Hermes-agent integration spike

## References

- ADR-0008 — three-loop architecture (`memory/decisions/0008-three-loop-architecture.md`)
- Codex consult session — `019e2d04-d11a-7660-8b28-7d369d916c7a` (saved in `.context/codex-session-id`)
- Memory note — agentic /home idea (`~/.claude/projects/.../memory/project_v16_agentic_home_idea.md`)
- Existing queue plumbing — `propose_change` RPC at `apps/dashboard/supabase/migrations/0040_propose_change.sql`
- Existing operations log — `apps/dashboard/supabase/migrations/0007_operations_log_bindings_proposals_audit.sql`
- Phase P Step 2 — current /home implementation being replaced (commits 9021d2f back through 018b5d9)
- External — [nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent), [browser-use/browser-use](https://github.com/browser-use/browser-use) (both deferred past v1.6)
