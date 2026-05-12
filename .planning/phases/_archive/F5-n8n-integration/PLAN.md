# F5 — n8n Integration (DESIGN ONLY)

## Context

The original BBC PDF (hole #3) suggested time-triggered ambient presence via n8n. Hole #5 of the same PDF flagged auto-pipelines as **the single biggest risk** — "auto-generated code talking to external APIs (auth, throttling, public posting, irreversible side effects)." The right response is **gated integration**: n8n proposes; nothing about the BBC trust model changes; every n8n action lands in the same queue with the same Manager review + Main accept that any human-originated change has.

This phase defines that gating contract. No scripts. No webhook endpoints. No deployment. **Build phases (F5-build-1+) are deferred** until the org actually needs scheduled external triggers.

## Roles

- **n8n** is an *external scheduler* that lives outside BBC. It can:
  - Fire on cron schedules.
  - Call external APIs (Higgsfield, Buffer, GitHub, etc.).
  - Receive webhooks from those APIs.
  - **Propose** changes back to BBC via a single endpoint (see §3).
- **n8n is NOT** allowed to:
  - Mutate `bbc/memory/`, `bbc/queue/_accepted/`, or any Main-owned file directly.
  - Bypass Manager review.
  - Execute `accept.sh`, `reject.sh`, or any other writer.

The only path n8n has into BBC is `propose.sh`, wrapped behind authenticated webhook.

## 1. The proposal-only constraint

n8n integrates by writing proposals. Every n8n run that changes BBC state files a proposal file in `bbc/queue/` with:

```yaml
proposed_by: n8n:<workflow-id>
proposed_at: <ISO-8601>
target_layer: main | manager
target_file: <relative path>
change_kind: edit | add | supersede | archive
diff_summary: "<short, single line>"
source: "n8n workflow:<workflow-id> run:<run-id>"
status: pending
```

The Manager review step (`/bbc:review` or queue-reviewer agent) runs against n8n proposals using the same rules as any other proposal:
- Apply `manager/rules/proposal-review.md`.
- Apply `manager/rules/no-vendor-names-in-prose.md` (n8n-generated text often contains vendor names — flag them).
- Apply `manager/rules/cross-leaf-sync.md`.
- Verdict: `approved` / `changes_requested` / `rejected`.

**No fast-path.** Even high-confidence n8n proposals route through review. This is the entire point of gating.

## 2. Webhook security

A small HTTP endpoint (deferred build) receives signed payloads from n8n and converts them into queue files. Constraints:

- **HMAC-SHA256 signature** on every request (`X-BBC-Signature` header). Signing key in BBC_N8N_SIGNING_SECRET env var.
- **Allowlist of workflow-ids**. Each registered n8n workflow has a record at `memory/ops/n8n-workflows/<workflow-id>.yaml` declaring: id, purpose, expected schedule, expected target_files (so a "post to social media" workflow can't suddenly try to edit `bbc/CLAUDE.md`).
- **Rate limit**: max N proposals per workflow per hour; per global cap. Configurable in `_n8n-config.yaml`.
- **Idempotency**: every webhook payload includes a unique `run_id`. The endpoint dedupes — a retry on the same `run_id` produces no new queue file.
- **Audit**: every webhook hit logs to `_log/operations.jsonl` with `actor: n8n:<workflow-id>:<run-id>`, regardless of whether a queue file was produced.

## 3. Workflow registration

Each n8n workflow gets a record before it can post:

```yaml
# memory/ops/n8n-workflows/marketing-tiktok-recap.yaml
---
id: ext_n8n_marketing-tiktok-recap
workflow_id: marketing-tiktok-recap
type: n8n-workflow
scope: leaf:8azi-market
layer: main
owning_layer: main
status: accepted | suspended
created: 2026-05-08T00:00:00Z
purpose: "Daily summary of TikTok engagement; proposes adding a row to memory/ops/outcomes/."
expected_schedule: "0 9 * * *"   # cron (advisory; n8n owns the actual schedule)
expected_target_files:
  - memory/ops/outcomes/social/*.jsonl
expected_change_kinds: [add]
max_proposals_per_hour: 4
allowlist_signers: [<n8n-instance-id>]
---
```

The endpoint refuses any payload whose `target_file` doesn't match `expected_target_files` or whose `change_kind` isn't in `expected_change_kinds`. This is the kill-switch: a marketing workflow cannot suddenly try to mutate `bbc/CLAUDE.md`.

## 4. Cold-start, runaway, and abuse mitigations

| Risk | Mitigation |
|---|---|
| **Runaway loop** (workflow stuck firing every minute) | Rate limit per workflow + per global cap. Exceed → all subsequent payloads dropped with WARN log; alert in `_log/`. |
| **Gamed input** (compromised vendor pushes a payload to n8n) | HMAC signature + workflow allowlist. Even valid signature still routes through Manager review. |
| **Vendor lock-in** | n8n is just one possible external scheduler. The webhook endpoint accepts the same shape from any caller; replacing n8n with another tool only requires re-pointing the cron source. The `proposed_by:` namespace is `n8n:<id>` for clarity but the protocol is generic. |
| **Auto-flood after restart** | All scheduled workflows on n8n's side are bound to one trigger per cron tick; webhook endpoint drops duplicates by `run_id`. |
| **Human cannot keep up with proposals** | Manager review is the bottleneck by design. If volume exceeds review capacity, suspend the workflow (`status: suspended` in its registration record). The endpoint refuses payloads from suspended workflows. |

## 5. Build phases (named, NOT designed here)

- **F5-build-1**: workflow-registration schema + the workflow record validator (mirrors `validate-providers.sh`). One-week scope.
- **F5-build-2**: webhook endpoint as a Next.js route in the dashboard repo. HMAC verify + dedup + queue-file generation + log entry. Two-week scope.
- **F5-build-3**: rate limit + suspended workflow handling + `/bbc:n8n-status` slash command (read state of all workflows + their recent activity). One-week scope.
- **F5-build-4**: `n8n-flow-builder` route in the dashboard for a small subset of low-risk workflows (visualize/approve before activating). PDF hole #9's "pipeline builder" — explicitly post-V1.

Each build phase is its own future GSD plan.

## 6. What this design does NOT solve

Honest scope:

- **Causal validation of n8n outputs.** We can't verify that a proposal from n8n actually reflects what the external API said happened. A workflow can lie. Manager review is the only check.
- **Cross-workflow coordination.** Two workflows trying to edit the same target file race in the same way two human leaves can — handled by the existing concurrent-proposals policy in `manager/rules/cross-leaf-sync.md`.
- **n8n-side compromise.** If the n8n instance itself is compromised, the attacker has the signing secret and can issue valid-looking proposals. Mitigation = rotate secrets, review-gate everything, and treat n8n as untrusted for direct mutation (which we already do).
- **Workflow author identity.** We track which workflow proposed; we don't track which human authored that workflow. Add `created_by:` to the registration record if needed.

## 7. Acceptance for this DESIGN phase

- This PLAN.md exists.
- Build phases F5-build-1..4 named with rough scope.
- §6 honestly states what's still unsolved.
- The roadmap (`bbc/.planning/ROADMAP.md`) and STATE.md are updated to list F5 as designed (not implemented).

## Source

PDF holes #3 and #5. The review gating in §1 directly enforces hole #5's "highest-tier structural change" mandate.
