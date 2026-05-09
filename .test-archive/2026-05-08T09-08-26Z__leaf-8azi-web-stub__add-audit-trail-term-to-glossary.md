---
proposal_id: prop_2026-05-08T09-08-26Z_leaf-8azi-web-stub_add-audit-trail-term-to-glossary
proposed_by: leaf:8azi-web-stub
accepted_at: 2026-05-08T09:11:07Z
proposed_at: 2026-05-08T09:08:26Z
target_layer: main
target_file: memory/glossary/terms.md
change_kind: edit
diff_summary: "add audit-trail term to glossary"
source: "human directive: phase 08 walkthrough, 2026-05-08"
status: accepted
manager_review:
  reviewer: manager
  reviewed_at: 2026-05-08T00:00:00Z
  verdict: approved
  notes: "Well-formed edit proposal. Filename, frontmatter, and unified-diff body all conform to queue/README.md. Source cites a dated human directive (strong). One logical change (single glossary term). Does not contradict Main principles. Target memory/glossary/terms.md exists and the diff context lines match."
cross_leaf_impact:
  affected_leaves: ["every leaf (per manager/rules/cross-leaf-sync.md: glossary is consumed by every leaf)"]
  sync_window: "same week"
  notes: "memory/glossary/terms.md is a cross-leaf shared file. After accept, Manager should open follow-up proposals for any leaf-local files that quote glossary terms; none known at this time."
---

```diff
--- a/memory/glossary/terms.md
+++ b/memory/glossary/terms.md
@@ -27,4 +27,5 @@
 | **Distribution leaf** | A BBC concept: per-workstream subdir under `bbc/distribution/`. Bootstraps from Main + Manager Claude.md. |
 | **Proposal queue** | A BBC concept: file-based change request mechanism. See `bbc/queue/README.md`. |
 | **Promotion** | Moving a fact from a Distribution leaf's local notes up to Main-owned memory via the queue. |
+| **Audit trail** | The chronological record of all proposals applied to a memory file. Reconstructable from `queue/_accepted/` plus the `provenance:` lists in each memory file's frontmatter. |
```
