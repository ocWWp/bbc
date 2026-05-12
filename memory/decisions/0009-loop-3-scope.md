---
id: decision_0009_loop-3-scope
type: decision
scope: org
layer: main
owning_layer: main
created: 2026-05-12T00:00:00Z
updated: 2026-05-12T00:00:00Z
status: proposed
tags: [adr, loop-3, scope, privacy]
supersedes: []
superseded_by: []
---

# ADR-0009: Loop 3 scope — what BBC observes, what it proposes

## Status

**Proposed.** Loop 3 cannot be built until Phase L ships and there are ≥50 active self-hosters or hosted-demo tenants generating real signal (per ROADMAP "hard prerequisites"). This ADR scopes the design so Loop 3 work is ready to start the moment the prerequisite lands.

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

## Related

- [[decision_0008_three-loop-architecture]] — the framing this ADR specializes.
- [[decision_0007_oss-first-agpl-deferred-commercialization]] — why we can take a slow-careful posture on Loop 3 instead of rushing.
- Loop 3 build phases (M, M+) — tracked in [.planning/ROADMAP.md](../../.planning/ROADMAP.md).
