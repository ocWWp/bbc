---
proposal_id: prop_2026-05-08T10-07-43Z_manager_f4-build-3-unbind-mobbin
proposed_by: manager
accepted_at: 2026-05-08T10:07:55Z
proposed_at: 2026-05-08T10:07:43Z
target_layer: main
target_file: memory/ops/bindings.yaml
change_kind: edit
diff_summary: "f4-build-3 unbind mobbin"
source: "F4-build-3 phase 3a: 2026-05-08"
status: accepted
manager_review:
  reviewer: manager
  reviewed_at: 2026-05-08T10:07:50Z
  verdict: approved
  notes: "Phase 3a — final binding flip before purge."
---

```diff
--- a/memory/ops/bindings.yaml
+++ b/memory/ops/bindings.yaml
@@ -25,1 +25,1 @@
-| pattern-reference | mobbin | 2026-03-01 | accessed via Mobbin MCP; reference only |
+| pattern-reference | (unbound) | — | mobbin decommissioned 2026-05-08 (F4-build-3 rehearsal); replacement TBD |
```

Phase 3a of decom: unbind mobbin from pattern-reference role. No replacement yet.
