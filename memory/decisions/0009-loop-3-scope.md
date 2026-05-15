---
id: decision_0009_loop-3-scope
type: decision
scope: org
layer: main
owning_layer: main
created: 2026-05-12T00:00:00Z
updated: 2026-05-15T00:00:00Z
status: accepted
tags: [adr, loop-3, scope, privacy, capability-class, v1.6]
supersedes: []
superseded_by: []
---

# ADR-0009: Loop 3 scope — what BBC observes, what it proposes

## Status

**Accepted (2026-05-15).** The v1.6 amendment below moves Loop 3 from "designed but blocked on hard prerequisites" to "shipping in v1.6 with a tightly scoped first slice." The original "≥50 tenants generating real signal" threshold no longer gates start of build — design v3 (`docs/plans/2026-05-15-agentic-home-design.md`, two codex passes) defines a first slice that is safe to ship without that scale: **manual trigger only, one capability-class implementation, queue-first findings, no silent state**. The originally listed prerequisites still apply to v1.7's cron / scheduler-driven mode.

**Original status:** proposed (2026-05-12). Loop 3 cannot be built until Phase L ships and there are ≥50 active self-hosters or hosted-demo tenants generating real signal (per ROADMAP "hard prerequisites"). This ADR scopes the design so Loop 3 work is ready to start the moment the prerequisite lands.

## Context

Loop 3 ("Improve") is the third leg of the [three-loop architecture](0008-three-loop-architecture.md). It is the mechanism by which BBC compounds: BBC watches a tenant use the brain, plus selected external signals, and files improvement proposals back into the same queue Loops 1 and 2 use. Proposals target **the company's operations**, not just BBC's code.

Without scope discipline, Loop 3 will either:
- Do nothing useful (vague "consider improving X" suggestions), or
- Cross privacy boundaries (cross-tenant inference), or
- Become a nag-bot (file proposals nobody actions).

This ADR pins down what Loop 3 may observe, what it may propose, the privacy floor, and the trigger frequency.

## Decision

### What Loop 3 observes

**In-tenant only, default ON:**

1. **Queue activity** — which proposals were accepted, rejected, or stayed pending. Reject reasons are particularly load-bearing.
2. **Memory access patterns** — which memory ids are cited by Studio runs, which never get cited, which get edited away after generation.
3. **Studio run accept/reject ratios** — per template, per role agent. A template whose drafts always get rejected unedited is a signal the template is broken.
4. **Bindings churn** — providers swapped, candidates left provisional past their bound_at + 30 days.
5. **Ingestion source coverage** — how much of a brain-dump's content actually became typed memory (extractor recall proxy).

**In-tenant, opt-in:**

6. **Sentry-class error streams** from leaves that explicitly subscribe (per-leaf token; tenant configures).
7. **Linear / GitHub / Jira issue events** from leaves that explicitly subscribe.
8. **Operations log** — already captured; opt-in to surface in Loop 3 proposals.

**Out of scope — never observed:**

- Source artifact bodies (PDFs, transcripts) beyond what was already extracted into typed memory.
- Cross-tenant comparisons unless covered by a separate ADR (see Privacy below).
- User behavior outside BBC routes (no analytics SDK exfil).

### What Loop 3 proposes

Loop 3 proposals MUST cite the signal that triggered them. Five classes:

1. **Memory schema gaps.** "Voice memory was cited 14× last week but has no `tone` field — propose adding it." Triggered by repeated extraction of the same unstructured pattern.
2. **Vendor consolidation.** "Three roles are bound to candidates older than 30 days — propose a F1 ranker run." Triggered by `bindings.provisional=true` aging.
3. **Decision conflicts.** "Memory X (decision) and memory Y (decision) say opposite things." Triggered by extractor flagging contradiction with an existing decision during Loop 1.
4. **Template drift.** "Tweet-thread template's last 8 runs were all heavily edited before accept — propose updating the template's voice clause." Triggered by accept-with-edits ratio over a threshold.
5. **Coverage gaps.** "70% of recent brain-dumps mentioned customers but tenant has zero memories of type `team` with role=customer-success." Triggered by lexical pattern over ingested content vs typed memory shape.

Every proposal lands as a normal queue item (`proposal_id` starts with `prop_loop3_`), gets a normal human review, and is accept/reject'd by the same governance path as any other proposal.

### Privacy floor

- **No cross-tenant aggregation in v1.** Loop 3 is per-tenant only.
- **Cross-tenant benchmarks** ("companies your size typically document X") require a separate ADR with explicit opt-in, k≥5 anonymity, and no raw memory bodies leaving the source tenant.
- **No PII exfil.** Loop 3 cannot include free-text from team or source_artifact memories in proposal bodies — only counts and ids.

### Trigger frequency

- **Daily scan**, no faster. Reduces nag-bot risk; gives signal time to accumulate.
- **Max 3 proposals per scan** per tenant. Loop 3 must rank and choose, not flood.
- **Manual trigger** available via dashboard for power users who want a Loop 3 run on demand.

### Who owns Loop 3 proposals

- **Default:** admin role only. Loop 3 proposals appear in the queue for admins to review.
- **Opt-in delegation:** admin can grant `loop3_review` scope to members. Tracked under the `tenant_role` system (no new role enum value in v1; uses scope flag on `tenant_members`).

## Consequences

**Easier:**

- Loop 3 implementation has a sharp spec: a scheduled job per tenant, fixed observation set, fixed proposal kinds.
- Privacy story is defensible. Per-tenant, opt-in for external streams, no PII in bodies.
- Failure mode is bounded: at most 3 noisy proposals a day per tenant; user can reject all of them with zero damage.

**Harder:**

- Cross-tenant insights are explicitly deferred. Tenants asking "how do we compare to similar companies" get "later."
- Five proposal classes is the *upper* bound for v1. Anything richer (e.g., "rewrite this voice memory to be punchier") is out of scope and queued for ADR-0010+.
- Implementation requires a scheduled-job mechanism BBC doesn't have yet. Cron-on-Cloudflare or a single background worker per Postgres database. Choice deferred to the M.1 build phase.

**Locked in:**

- Loop 3 is a queue producer, not a queue auto-accepter. **No silent autonomy** (Main CLAUDE.md principle 6).
- Loop 3 proposals look the same as any other proposal. No special UI, no special grant of authority.
- Privacy floor is a hard floor — relaxing it requires a successor ADR, not a config flag.

## v1.6 amendment (2026-05-15)

The original 2026-05-12 draft framed Loop 3's external signal sources as a vendor list (Sentry, Linear, GitHub, Jira opt-in). Codex review of the v1.6 design doc flagged this as architecturally weak: vendor names are not architecture (per Main CLAUDE.md principle 4), and a whitelist forces an ADR amendment every time a new analytics provider is added. This amendment reframes Loop 3 signal sources as **capability classes**, and pins down the v1.6 first slice that ships as part of the agentic /home work (`docs/plans/2026-05-15-agentic-home-design.md`).

### Capability classes as the architectural unit

Loop 3 talks about **classes of signal source**, not vendors. Each class declares a contract:

- **Scope** — what shape of data the adapter reads (metric series, log stream, ticket events, etc.). Excludes anything outside that shape.
- **Retention** — how long `observer_runs` snapshots persist per row before pruning. Default 365 days; class may tighten.
- **PII policy** — declares whether the adapter's data contains PII, and if so, the redaction step that runs before any data enters LLM context. Class may declare "no PII by construction" if it only reads aggregates.
- **Baseline method** — the algorithm used to detect anomalies (Z-score over rolling window, matched-window comparison, etc.). v1.6 ships Z-score + minimum-sample; richer methods are v1.7.
- **Kill-switch** — per-signal `enabled` flag, default `false` on row create. Three-step consent flow (propose → set up → enable) is mandatory; no signal becomes active without an explicit user click on Enable.
- **Cost model** — formula for estimated tokens per run, consumed by the `QuotaGate` library before the LLM call.

Adapters implementing the same class do not require an ADR amendment. They require: a tested adapter conforming to the contract, a row in the role-tool-bundle catalog, and the existing queue gate for findings.

### Capability class shipped in v1.6: read-only signal adapter

v1.6 defines exactly one class:

**Class: `read-only-signal-adapter`**
- **Scope** — pull-only access to a configured upstream system. No writes back. No event-level PII (aggregate metric series only in the v1.6 first slice). Reads scoped to the configured tenant credential.
- **Retention** — 365 days for `observer_runs.window_snapshot`; queue items + accepted memory rows follow existing retention.
- **PII policy** — adapter MUST declare PII shape in its capability descriptor. v1.6's one adapter declares "metric series only, no event-level PII."
- **Baseline method** — Z-score with configurable `(window_days, baseline_days, z_threshold, min_samples)`. Cooldown 24h per signal.
- **Kill-switch** — `observer_signals.enabled` boolean, default `false`. Three-step consent before activation.
- **Cost model** — declared per signal_type in the adapter's static `metric-catalog.ts`. Used by `reserve_quota` before each run.

**Implementations in v1.6: `posthog.metric` only.** Other potential implementations of this same class (Plausible, Mixpanel, GA4, Linear ticket events, GitHub deploys, Sentry error streams) are explicitly deferred to v1.7+ and require **no further ADR amendment** — they slot under this class once a tested adapter exists.

The original "opt-in observation" list of Sentry/Linear/GitHub/Jira from this ADR survives as **example future implementations of the read-only-signal-adapter class**, not as a privileged whitelist.

### How v1.6's six proposal classes relate to the existing five

The original five proposal classes (memory schema gaps, vendor consolidation, decision conflicts, template drift, coverage gaps) all describe **introspective** improvements driven by BBC's own observation of its own state. They remain valid in v1.6 (and are how the daily-scan path in v1.7 will produce most of its proposals).

v1.6 adds a **sixth proposal class**:

6. **External signal anomaly proposals.** Triggered when a read-only signal adapter detects a statistical anomaly against its declared baseline. Proposal body contains the agent's hypothesis text + cited memory IDs grounded via `GroundingVerifier`. Target path: `memory/observations/<run_id>.md`. Frontmatter includes `observer_run_id` linking to the operational trace. On accept, the file lands as durable memory under the new `observation` supertag (see M0.5 of the v1.6 plan).

### v1.6 hard constraints (re-stated and extended)

The original constraints carry forward verbatim. The amendment adds explicit clauses for the capability-class regime:

- **No silent autonomy.** Every Loop 3 proposal — including external-anomaly proposals — lands in the existing queue and waits for a human accept. (Re-states Main CLAUDE.md principle 6 and the original ADR.)
- **No cross-tenant aggregation in v1.** Per-tenant only. v1.6's `posthog.metric` adapter reads only the calling tenant's configured PostHog project via that tenant's BYOK key. Cross-tenant benchmarks remain deferred to a future ADR with explicit opt-in + k≥5 anonymity.
- **No external writes from adapters.** The read-only-signal-adapter class is read-only by definition. Adapters cannot send email, call write APIs, or mutate upstream state. The only side effect Loop 3 may produce is a queue item via the existing `propose_change` RPC.
- **No silent state changes.** No `observer_signals` row exists until the user clicks `Set up this watch` after seeing the agent's preview card; no signal is active until the user clicks `Enable watching` from `/settings/observers` or the action card. No PostHog calls happen before step 2.
- **Per-signal kill-switch is mandatory.** Default `enabled=false` on row create. Disabling restores zero external traffic for that signal within one observer run window.
- **No PII in proposal bodies.** Carries forward from the original Privacy floor. v1.6 adapter restricts to aggregate metric series, so this is enforced by construction.

### Trigger frequency for v1.6 — manual only

The original ADR allowed "daily scan, no faster" plus a manual trigger for power users. **v1.6 ships manual trigger only.** Specifically:

- **v1.6 trigger:** `POST /api/observer/run-now/:signalId`, authenticated, gated on `requireRole(actor, "operator")` (matches existing queue-accept gate from ADR-0012). Handler verifies the signal belongs to the actor's tenant and is `enabled=true`.
- **Cron / scheduled triggers are deferred to v1.7.** The original "daily scan" + "max 3 proposals per scan" policy stays on the books for v1.7's design but is not enforced in v1.6 (one signal per click; rate-limiting is per-tenant quota at the LLM call layer, not at the trigger).
- **Observer audit table.** `observer_runs` records both `requested_by` (authenticated user ID, nullable for v1.7 cron) and `executed_by` ('user' in v1.6; will accept 'cron' in v1.7) so the v1.7 transition is additive — no schema migration needed when cron lands.

### Ownership for v1.6

- `POST /api/observer/run-now/:id` requires **operator+** role (carries forward the queue-accept role gate).
- Observer proposals appear in the queue alongside other proposals and follow the existing admin-default + opt-in `loop3_review` scope model from this ADR's original "Who owns Loop 3 proposals" section.
- Per-tenant kill-switch lives at `/settings/observers` and is admin/operator-editable.

### What this amendment does NOT change

- The five original proposal classes remain valid.
- The Privacy floor remains identical (in-tenant, no PII exfil, cross-tenant benchmarks deferred).
- The original observation list (queue activity, memory access, Studio runs, bindings churn, ingestion source coverage) remains the spec for v1.7's daily-scan mode.
- The "no silent autonomy" principle stays absolute.
- The Phase M/M+ build-phase roadmap structure in `.planning/ROADMAP.md`.

### Future amendments anticipated (not in scope here)

- **v1.7 capability class: scheduled-observer.** Cloudflare Cron Triggers + per-tenant scheduling lease + sophisticated anomaly detection (matched windows, seasonality, drift). Will require its own ADR amendment to flesh out the per-tenant lease semantics and the rate-limit policy.
- **v1.8+ capability class: durable-tool-envelope.** Browser-use, send-email, API write tools. Will require its own ADR explicitly opening Loop 3 (and Loop 2) to side-effecting tools — currently still locked under "no external writes."
- **Future amendment: cross-tenant capability class** (benchmarks). Requires a separate ADR per the original Privacy floor; v1.6 does not move this line.

### Acceptance evidence (v1.6 amendment)

- Codex review (2026-05-15, session `019e2d04-d11a-7660-8b28-7d369d916c7a`) — second pass on the v1.6 design surfaced this reframe via issue #10. Implementation lands in M0–M4 of the v1.6 plan.
- M0.4 of `docs/plans/2026-05-15-agentic-home-PLAN.md` records the per-table mutation policy for the five new tables (`home_sessions`, `home_turns`, `observer_signals`, `observer_runs`, `tenant_quotas`).
- M0.5 of the same plan records the `observation` memory supertag spec used by external-anomaly proposals.

## Related

- [[decision_0008_three-loop-architecture]] — the framing this ADR specializes.
- [[decision_0007_oss-first-agpl-deferred-commercialization]] — why we can take a slow-careful posture on Loop 3 instead of rushing.
- `docs/plans/2026-05-15-agentic-home-design.md` — v1.6 design doc (v3, two codex passes).
- `docs/plans/2026-05-15-agentic-home-PLAN.md` — v1.6 execution plan (6 milestones).
- `apps/dashboard/supabase/migrations/0040_propose_change.sql` — the queue gate Loop 3 proposals route through.
- `apps/dashboard/supabase/migrations/0039_rbac_rpc_gates.sql` — the role gate `POST /api/observer/run-now/:id` reuses.
- Loop 3 build phases (M, M+) — tracked in [.planning/ROADMAP.md](../../.planning/ROADMAP.md).
