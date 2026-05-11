---
proposal_id: prop_2026-05-08T10-06-44Z_manager_f4-build-3-announce-mobbin-v2
proposed_by: manager
accepted_at: 2026-05-08T10:07:01Z
proposed_at: 2026-05-08T10:06:44Z
target_layer: main
target_file: memory/ops/providers/mobbin.yaml
change_kind: edit
diff_summary: "f4-build-3 announce mobbin v2"
source: "F4-build-3 rehearsal v2: 2026-05-08"
status: accepted
manager_review:
  reviewer: manager
  reviewed_at: 2026-05-08T10:06:50Z
  verdict: approved
  notes: "Corrected single-hunk diff. v1 had hallucinated body context."
cross_leaf_impact:
  shared_file: memory/ops/providers/mobbin.yaml
  affected_leaves: []
  consumer_code_tags: 0
  notes: "Quarantine no-op — zero bbc-provider:mobbin tags."
---

```diff
--- a/memory/ops/providers/mobbin.yaml
+++ b/memory/ops/providers/mobbin.yaml
@@ -1,14 +1,17 @@
 ---
 id: provider_mobbin
 provider_id: mobbin
 type: provider-adapter
 implements: [pattern-reference]
 contract_version: 1
-status: active
+status: deprecated
 scope: org
 layer: main
 owning_layer: main
 created: 2026-05-08T00:00:00Z
 updated: 2026-05-08T00:00:00Z
 tags: [adapter, design, reference, mcp]
+sunset_date: 2026-06-08T00:00:00Z
+decommission_reason: "F4-build-3 rehearsal: pattern-reference role retired (no production code path uses it)."
+replacement_provider_id: tbd
 ---
```

Decommission Phase 1 (corrected): Announce. Single-hunk diff to avoid line-offset patch issues.
