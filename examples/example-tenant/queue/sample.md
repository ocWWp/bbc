---
proposal_id: prop_2026-05-09T13-00-00Z_human-bob_add-llm-provider-binding
proposed_by: human:bob
accepted_at: null
proposed_at: 2026-05-09T13:00:00Z
target_layer: main
target_file: memory/ops/bindings.yaml
change_kind: edit
diff_summary: "Bind llm-provider to a candidate Anthropic Claude adapter"
source: "Bob's research notes 2026-05-09; need an LLM bound before agent integration work."
status: pending
---

# Proposal: bind llm-provider

Bind `llm-provider` in `memory/ops/bindings.yaml` to `example-llm-provider` (placeholder; would be `anthropic-claude.yaml` once we author that adapter).

## Why

We're starting on the agent-integration work this week (see leaf-local notes in `distribution/example-leaf/local/`). Agent code needs a defined `llm-provider` to call. Today the role is unbound; that blocks the agent work.

## Diff

```diff
--- a/memory/ops/bindings.yaml
+++ b/memory/ops/bindings.yaml
@@ -16,7 +16,7 @@
 | role | provider | provisional | bound_at | notes |
 |---|---|---|---|---|
 | db-provider | example-db-provider | yes | 2026-05-09 | Acme committed to a managed-Postgres provider (ADR-0002)... |
-| llm-provider | (unbound) | — | — | Pending vendor selection. Candidates: Anthropic Claude family, OpenAI GPT family. |
+| llm-provider | example-llm-provider | yes | 2026-05-09 | Anthropic Claude family (model_id_pinned in adapter). Bob's call; ADR-0003 pending. |
 | email-delivery | (unbound) | — | — | Pending. Will pick one of the example-email-delivery candidates. |
```

## Acceptance criteria

- An ADR-0003 is filed within 1 week of this accept, justifying the choice.
- The example-llm-provider adapter is renamed to a real vendor file before any production agent traffic.
- `bbc-provider:example-llm-provider` tags appear at every llm-call call site for swap-test grep coverage.
