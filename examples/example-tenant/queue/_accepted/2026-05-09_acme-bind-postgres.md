---
proposal_id: prop_2026-05-09T11-15-00Z_human-alice_bind-postgres-managed
proposed_by: human:alice
accepted_at: 2026-05-09T11:30:00Z
proposed_at: 2026-05-09T11:15:00Z
target_layer: main
target_file: memory/ops/bindings.yaml
change_kind: edit
diff_summary: "Bind db-provider to managed-Postgres adapter (placeholder until vendor pick)"
source: "ADR-0002 — Acme picks Postgres-managed for db role"
status: accepted
manager_review:
  reviewer: manager
  reviewed_at: 2026-05-09T11:25:00Z
  verdict: approved
  notes: "Vendor binding requires an ADR; ADR-0002 attached. Approved."
---

# Proposal: bind db-provider to managed Postgres

Bind `db-provider` in `memory/ops/bindings.yaml` to `example-db-provider` (placeholder for the eventual specific managed-Postgres vendor).

## Why

ADR-0002 (`memory/decisions/0002-acme-pick-postgres.md`) records the rationale: managed Postgres keeps standard SQL semantics, removes ops burden, gives Acme a migration path off vendor lock-in if needed. We need this bound before any persistence-touching feature ships.

## Diff

```diff
--- a/memory/ops/bindings.yaml
+++ b/memory/ops/bindings.yaml
@@ -16,7 +16,7 @@
 | role | provider | provisional | bound_at | notes |
 |---|---|---|---|---|
-| db-provider | (unbound) | — | — | Pending. |
+| db-provider | example-db-provider | yes | 2026-05-09 | Acme committed to a managed-Postgres provider (ADR-0002); specific vendor TBD. Currently using the placeholder adapter. |
```

## Manager review

Reviewer: manager (sole reviewer; Acme is small enough that the Manager and Main roles can be operated by the same human).
Verdict: approved.
Notes: "Vendor binding requires an ADR; ADR-0002 attached. Approved."

## Accepted

By: Alice (admin) at 2026-05-09T11:30:00Z. Provenance recorded in `memory/ops/bindings.yaml` frontmatter.
