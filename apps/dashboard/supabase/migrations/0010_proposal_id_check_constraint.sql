-- Phase 3 hardening: enforce proposal_id shape at the DB level so direct
-- callers (MCP server, psql, custom integrations) can't write junk
-- targets that the dashboard would otherwise reject. The dashboard
-- (apps/dashboard/src/app/queue/actions.ts) and both stores
-- (LocalStore, SupabaseStore) all enforce /^prop_[\w:.-]+$/ but the
-- table did not — closing that gap.

alter table public.queue_items
  add constraint queue_items_proposal_id_shape_chk
  check (proposal_id ~ '^prop_[A-Za-z0-9:._-]+$');
