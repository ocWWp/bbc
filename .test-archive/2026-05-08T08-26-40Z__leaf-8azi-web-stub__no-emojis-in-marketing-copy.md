---
proposal_id: prop_2026-05-08T08-26-40Z_leaf-8azi-web-stub_no-emojis-in-marketing-copy
proposed_by: leaf:8azi-web-stub
accepted_at: 2026-05-08T08:28:27Z
proposed_at: 2026-05-08T08:26:40Z
target_layer: main
target_file: memory/design/voice-tone.md
change_kind: edit
diff_summary: "no emojis in marketing copy"
status: accepted
manager_review:
  reviewer: manager
  reviewed_at: 2026-05-08T00:00:00Z
  verdict: approved
  notes: "Well-formed edit; one logical change; consistent with existing voice rules ('State, don't perform'). Targets cross-leaf shared file — see cross_leaf_impact block."
cross_leaf_impact:
  shared_file: memory/design/voice-tone.md
  consumed_by:
    - 8azi-web-stub
  cross_repo_anchors:
    - 8azi-web/src/shared/lib/voice/pillar-interactions.ts
    - 8azi-api/app/shared/llm/prompts.py
    - 8azi-api/app/features/party/router.py
  sync_window: same week
  followups_required: "After accept, open follow-up proposals for any leaf-local copy that quotes voice rules; propagate to cross-repo anchors within the same week."
---

```diff
--- a/memory/design/voice-tone.md
+++ b/memory/design/voice-tone.md
@@ -19,6 +19,7 @@
 
 - Speak in second person to the reader. Never "users."
 - Cite the BaZi mechanic plainly when relevant (e.g., "your Day Master is Yang Water").
 - No corporate hedging ("we believe," "studies show"). State, don't perform.
+- No emojis in marketing copy across all 8azi products.
 
 ## Voice anchors (cross-repo)
 
```
