---
id: mem_2026-05-11_ops-ingestion-text
type: fact
scope: org
layer: manager
source: human:oscar
created: 2026-05-11T00:00:00Z
updated: 2026-05-11T00:00:00Z
owning_layer: manager
tags: [ops, ingestion, sources, trust]
status: accepted
---

# Ingestion policy — text

**Trust tier:** high. User-typed content, attested by the act of typing it.

**Expected fact shape:** anything. The textarea is the only universal escape valve; no content type is off-limits.

**Default acceptance:** always human review via the proposal queue. No auto-accept under any circumstance for text input — principle #6.

**Notes:**
- Size cap: 50,000 chars at the adapter, 8,000 chars at the extractor (current `MAX_INPUT_CHARS` in `apps/dashboard/src/app/welcome/actions.ts`).
- PII scrub runs before LLM extraction (`scrubPII()` in the same file). Patterns are intentionally tight — coarse net, not a comprehensive DLP.
- If the same content is re-ingested (same `content_hash`), `ingestSource` returns the existing source row instead of inserting a duplicate.
