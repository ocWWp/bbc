---
proposal_id: prop_TEMPLATE_DATE_sample_first_proposal
proposed_by: human:TEMPLATE_OWNER
accepted_at: null
proposed_at: TEMPLATE_DATE
target_layer: main
target_file: memory/decisions/0002-first-real-decision.md
change_kind: add
diff_summary: "Sample proposal — replace this with your first real decision."
source: "BBC initial-tenant template"
status: pending
---

# Sample proposal: your first real decision

This is a sample queue item that ships with every new BBC instance. It's here so you can see the propose → review → accept flow without waiting for your first real change.

## What to do

1. Open this proposal in the dashboard `/queue/<proposal_id>` route.
2. Click **Reject** to dismiss this sample (the rejection is permanent and audit-logged).
3. Then write your first **real** proposal:
   - From the dashboard's queue page, click "New proposal" (Phase 6+ feature when MCP is integrated).
   - Or via SQL / API: insert a row into `queue_items` with status `pending`.

## What's missing in this template

- A real `target_layer` and `target_file` — these are placeholders.
- A real diff — the body should normally be a unified diff or new file content.
- A `manager_review` annotation — Manager would add this after triaging the queue.

This sample is intentionally incomplete so it's obvious it's not a real decision. Reject it.
