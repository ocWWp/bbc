---
proposal_id: prop_2026-05-08T08-37-57Z_leaf-8azi-web-stub_add-provenance-term-to-glossary
proposed_by: leaf:8azi-web-stub
accepted_at: 2026-05-08T08:41:15Z
proposed_at: 2026-05-08T08:37:57Z
target_layer: main
target_file: memory/glossary/terms.md
change_kind: edit
diff_summary: "add Provenance term to glossary"
source: "human directive in conversation 2026-05-08"
status: accepted
manager_review:
  reviewer: manager
  reviewed_at: 2026-05-08T00:00:00Z
  verdict: approved
  notes: "Well-formed edit to memory/glossary/terms.md. Single logical change (one new term). Source is an explicit human directive. Definition is accurate against queue/README.md lifecycle and accept.sh provenance behavior. Ready for accept.sh."
cross_leaf_impact:
  affected_leaves: [every leaf with user-facing copy or BBC tooling consumers of glossary]
  shared_file: memory/glossary/terms.md
  sync_window: same week
  notes: "Glossary is listed in manager/rules/cross-leaf-sync.md as consumed by every leaf (same-week sync). Pure addition of a term — no existing definitions changed — so no follow-up leaf-local rewrites are required, but leaves should re-read terms.md within the week."
---

```diff
--- a/memory/glossary/terms.md
+++ b/memory/glossary/terms.md
@@ -25,3 +25,4 @@
 | **Distribution leaf** | A BBC concept: per-workstream subdir under `bbc/distribution/`. Bootstraps from Main + Manager Claude.md. |
 | **Proposal queue** | A BBC concept: file-based change request mechanism. See `bbc/queue/README.md`. |
 | **Promotion** | Moving a fact from a Distribution leaf's local notes up to Main-owned memory via the queue. |
+| **Provenance** | The audit-trail record of how a memory file came to have its current content. Stored as a `provenance:` list of proposal ids in the file's frontmatter, appended automatically by `scripts/accept.sh` whenever a proposal is applied. |
```
