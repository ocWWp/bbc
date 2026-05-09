---
proposal_id: prop_2026-05-08T10-05-16Z_manager_f4-build-3-announce-mobbin-decommission
proposed_by: manager
proposed_at: 2026-05-08T10:05:16Z
rejected_at: 2026-05-08T10:06:26Z
rejection_reason: "F4-build-3 finding: diff had hallucinated body context lines causing partial-apply failure. Re-filing with corrected single-hunk diff."
target_layer: main
target_file: memory/ops/providers/mobbin.yaml
change_kind: edit
diff_summary: "f4-build-3 announce mobbin decommission"
source: "F4-build-3 rehearsal: human directive 2026-05-08"
status: rejected
manager_review:
  reviewer: manager
  reviewed_at: 2026-05-08T10:05:30Z
  verdict: approved
  notes: "F4-build-3 rehearsal. No consumer code uses bbc-provider:mobbin so cross_leaf_impact is informational only."
cross_leaf_impact:
  shared_file: memory/ops/providers/mobbin.yaml
  affected_leaves: []
  consumer_code_tags: 0
  sync_window: same-week
  notes: "Rehearsal target — pattern-reference role has no production code path. Quarantine sweep will be a no-op."
---

```diff
--- a/memory/ops/providers/mobbin.yaml
+++ b/memory/ops/providers/mobbin.yaml
@@ -10,6 +10,9 @@
 created: 2026-05-08T00:00:00Z
 updated: 2026-05-08T00:00:00Z
 tags: [adapter, design, reference, mcp]
+sunset_date: 2026-06-08T00:00:00Z
+decommission_reason: "F4-build-3 rehearsal: pattern-reference role retired (no production code path uses it; design phases use direct browsing now)."
+replacement_provider_id: tbd
 ---
 
 # Adapter: mobbin
@@ -22,7 +25,7 @@ implements: [pattern-reference]
 type: provider-adapter
 implements: [pattern-reference]
 contract_version: 1
-status: active
+status: deprecated
 scope: org
 layer: main
 owning_layer: main
```

Decommission Phase 1: Announce. Mobbin pattern-reference adapter is being deprecated. Sunset 2026-06-08.
